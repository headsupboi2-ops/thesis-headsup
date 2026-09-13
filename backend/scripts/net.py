"""
HTTP fetch helper with an IPv4 fallback for broken-IPv6 networks.

Several agency feeds (metoc.navy.mil among them) are served from CDNs that
publish both A and AAAA records. On a network whose IPv6 route is broken, the
TCP connect to the IPv6 address SUCCEEDS and the connection is only reset
during the TLS handshake:

    ConnectionError('Connection aborted.', ConnectionResetError(10054, ...))

That timing is what makes this worth handling here. urllib3 already walks every
getaddrinfo result when a *connect* fails, so a dead IPv6 address that refuses
TCP costs nothing — it falls through to IPv4 on its own. A reset during the
handshake happens after urllib3 has committed to the socket, so no amount of
address iteration helps; only retrying the whole request pinned to IPv4 does.

Once a host is known bad over IPv6 it is remembered for the life of the
process, so the stall is paid once rather than on every poll.
"""

import logging
import socket
import threading
from urllib.parse import urlsplit

import requests
import urllib3.util.connection as _u3conn

logger = logging.getLogger(__name__)

# Hosts whose IPv6 path reset on us — retried over IPv4 directly from then on.
_ipv4_only_hosts = set()
_state_lock = threading.Lock()
# Serializes the family patch below, which is unavoidably process-wide.
_family_lock = threading.RLock()


class _force_ipv4:
    """
    Make urllib3 resolve A records only, for the duration of the block.

    urllib3 exposes no per-request address family, so the module hook it
    consults has to be swapped. It is held under a lock and only around a
    single request; a concurrent request can at worst also be pinned to IPv4
    for that moment, which is harmless — IPv4 is the path that works.
    """

    def __enter__(self):
        _family_lock.acquire()
        self._original = _u3conn.allowed_gai_family
        _u3conn.allowed_gai_family = lambda: socket.AF_INET
        return self

    def __exit__(self, *exc_info):
        _u3conn.allowed_gai_family = self._original
        _family_lock.release()
        return False


def _host_of(url):
    try:
        return (urlsplit(url).hostname or '').lower()
    except ValueError:
        return ''


def _has_ipv4(host):
    """True when the host publishes an A record worth falling back to."""
    if not host:
        return False
    try:
        socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
        return True
    except socket.gaierror:
        return False


def get(url, **kwargs):
    """
    requests.get, retried over IPv4 when the IPv6 path is reset.

    Behaves exactly like requests.get otherwise: same arguments, same return
    value, same exceptions. Only a ConnectionError triggers the retry — an
    HTTP error status, a timeout or a certificate problem is not an address
    family problem and is raised untouched.
    """
    host = _host_of(url)

    with _state_lock:
        known_bad = host in _ipv4_only_hosts
    if known_bad:
        with _force_ipv4():
            return requests.get(url, **kwargs)

    try:
        return requests.get(url, **kwargs)
    except requests.exceptions.ConnectionError as first_error:
        # Only worth a second attempt if there is an IPv4 address to move to.
        if not _has_ipv4(host):
            raise
        logger.info('%s failed over the default address family (%s); '
                    'retrying over IPv4', host, first_error)
        try:
            with _force_ipv4():
                response = requests.get(url, **kwargs)
        except requests.exceptions.RequestException:
            raise first_error     # IPv4 is no better — report the original
        with _state_lock:
            _ipv4_only_hosts.add(host)
        logger.warning('%s is unreachable over IPv6 from this host; '
                       'pinning it to IPv4 for the rest of this process', host)
        return response
