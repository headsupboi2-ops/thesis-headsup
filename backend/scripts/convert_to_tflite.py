"""
One-time offline conversion: lstm_path_model.keras -> lstm_path_model.tflite.

Run locally (needs the full TensorFlow install from requirements_local.txt —
never run on Vercel, matching train_lstm.py/backtest.py). Excluded from the
deployed bundle via vercel.json's excludeFiles, same as those two scripts.

Why: TensorFlow itself is ~250MB+, well over half of Vercel's 500MB function
limit before its own transitive deps are even counted — that's why the
deployed backend has run in physics-fallback mode. The trained model is only
~78KB of parameters; tflite-runtime (the deployed-side interpreter) is
~2.4MB. Converting once, offline, and shipping the tiny interpreter instead
of the full framework is the fix.

Also extracts the two sklearn scalers' parameters (MinMaxScaler,
StandardScaler) to a plain JSON file, so the deployed path can replicate
their transform/inverse_transform with a few lines of numpy instead of
pulling in scikit-learn (another ~9MB) just to unpickle two arrays of
numbers.

Produces:
  models/lstm_path_model.tflite   - the converted model
  models/lstm_scalers.json        - {"lstm_scaler": {...}, "lstm_resid_scaler": {...}}

Then runs a numeric-parity check: the same input windows through both the
original Keras model and the converted TFLite model, asserting the outputs
match within float32 tolerance.
"""
import json
import os

import joblib
import numpy as np
import tensorflow as tf

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(_ROOT, "models")

KERAS_PATH = os.path.join(MODELS_DIR, "lstm_path_model.keras")
TFLITE_OUT = os.path.join(MODELS_DIR, "lstm_path_model.tflite")
SCALERS_OUT = os.path.join(MODELS_DIR, "lstm_scalers.json")

LSTM_SCALER_PKL = os.path.join(MODELS_DIR, "lstm_scaler.pkl")
LSTM_RESID_SCALER_PKL = os.path.join(MODELS_DIR, "lstm_resid_scaler.pkl")


def convert_model():
    model = tf.keras.models.load_model(KERAS_PATH, compile=False)
    print(f"Loaded {KERAS_PATH}: input_shape={model.input_shape} output_shape={model.output_shape}")

    # The Keras model's default signature has a dynamic (None) batch
    # dimension. TFLite's LSTM-fusion pass (which collapses the layer's
    # internals into a single fused UnidirectionalSequenceLSTM op) needs a
    # fully static input shape to trigger -- with a dynamic batch it falls
    # back to a generic while-loop/resource-variable lowering that this
    # converter version cannot execute correctly (the earlier attempt with a
    # tf.function wrapper hit exactly that: a null resource variable at
    # invoke time). Production only ever calls this model with batch=1 (one
    # window at a time, see _rollout_hybrid), so rebuilding the model with a
    # static (1, T, 4) input and converting THAT via the standard
    # from_keras_model path -- letting the fusion pass see a plain Keras
    # model, which is what it's designed for -- is safe (matches real usage
    # exactly) and lets the intended fusion path run.
    t = model.input_shape[1]
    static_input = tf.keras.Input(batch_shape=(1, t, 4))
    static_model = tf.keras.Model(static_input, model(static_input))
    static_model.set_weights(model.get_weights())

    converter = tf.lite.TFLiteConverter.from_keras_model(static_model)
    # No quantization/optimization flags: keep full float32 precision so the
    # converted model's numeric output matches the original as closely as
    # possible. The model is tiny (78KB) -- there's no size pressure that
    # would justify trading accuracy for a smaller file here.
    tflite_model = converter.convert()

    with open(TFLITE_OUT, "wb") as f:
        f.write(tflite_model)
    size_kb = os.path.getsize(TFLITE_OUT) / 1024
    print(f"Wrote {TFLITE_OUT} ({size_kb:.1f} KB)")
    return model


def extract_scaler_params():
    """MinMaxScaler and StandardScaler both reduce to a handful of arrays.
    Pulling those out avoids needing scikit-learn just to unpickle them.

    joblib.load here deserializes our own first-party trained artifacts
    (committed to this repo, produced by our own train_lstm.py) — not data
    from an untrusted source, matching the same pattern app.py already uses
    for the RF intensity classifier and ai_models.py already uses for these
    exact scaler files.
    """
    mm = joblib.load(LSTM_SCALER_PKL)          # sklearn MinMaxScaler
    ss = joblib.load(LSTM_RESID_SCALER_PKL)    # sklearn StandardScaler

    params = {
        "lstm_scaler": {
            "type": "minmax",
            "data_min_": mm.data_min_.tolist(),
            "data_max_": mm.data_max_.tolist(),
            "feature_range": list(mm.feature_range),
        },
        "lstm_resid_scaler": {
            "type": "standard",
            "mean_": ss.mean_.tolist(),
            "scale_": ss.scale_.tolist(),
        },
    }
    with open(SCALERS_OUT, "w", encoding="utf-8") as f:
        json.dump(params, f, indent=2)
    print(f"Wrote {SCALERS_OUT}")
    return mm, ss


def minmax_transform_numpy(x, data_min_, data_max_, feature_range):
    """Pure-numpy equivalent of sklearn MinMaxScaler.transform."""
    lo, hi = feature_range
    data_range = np.where(
        (data_max_ - data_min_) == 0, 1.0, data_max_ - data_min_)
    return (x - data_min_) / data_range * (hi - lo) + lo


def standard_inverse_transform_numpy(x, mean_, scale_):
    """Pure-numpy equivalent of sklearn StandardScaler.inverse_transform."""
    return x * scale_ + mean_


def parity_check(keras_model, mm, ss):
    """Feed several physically-plausible windows through both the Keras
    model and the converted TFLite model; assert the outputs agree."""
    interpreter = tf.lite.Interpreter(model_path=TFLITE_OUT)
    interpreter.allocate_tensors()
    in_detail = interpreter.get_input_details()[0]
    out_detail = interpreter.get_output_details()[0]
    print(f"TFLite input detail: {in_detail['shape']} {in_detail['dtype']}")
    print(f"TFLite output detail: {out_detail['shape']} {out_detail['dtype']}")

    rng = np.random.default_rng(42)
    max_abs_diff = 0.0
    n_cases = 20
    for i in range(n_cases):
        # Random but plausible physical window: [lat, lon, pressure, wind]
        lat = rng.uniform(5, 30, size=8)
        lon = rng.uniform(115, 175, size=8)
        pres = rng.uniform(900, 1010, size=8)
        wind = rng.uniform(20, 150, size=8)
        raw = np.stack([lat, lon, pres, wind], axis=1).astype(np.float64)  # (8, 4)

        normed = minmax_transform_numpy(
            raw, np.array(mm.data_min_), np.array(mm.data_max_), mm.feature_range
        ).astype(np.float32)
        x = normed[np.newaxis]  # (1, 8, 4)

        keras_out = keras_model.predict(x, verbose=0)  # (1, 4)

        # The converted graph carries the LSTM's cell/hidden state as
        # resource variables; each call is a fresh, independent forecast
        # window (never a continuation of a previous call's state), so
        # those variables must be reset before every invoke -- without
        # this the interpreter either errors (uninitialized) or silently
        # carries state across unrelated windows.
        interpreter.reset_all_variables()
        interpreter.set_tensor(in_detail["index"], x)
        interpreter.invoke()
        tflite_out = interpreter.get_tensor(out_detail["index"])  # (1, 4)

        diff = np.abs(keras_out - tflite_out).max()
        max_abs_diff = max(max_abs_diff, float(diff))
        if i < 3:
            print(f"  case {i}: keras={keras_out.ravel()} tflite={tflite_out.ravel()} diff={diff:.2e}")

    print(f"\nParity check over {n_cases} random windows: max abs diff = {max_abs_diff:.2e}")
    # Float32 TFLite conversion with no quantization should match the
    # original to well within 1e-4 -- this is a real assertion, not a
    # formality: it fails loudly if the conversion silently altered the
    # model's numeric behaviour.
    assert max_abs_diff < 1e-4, f"TFLite output diverges from Keras by {max_abs_diff:.2e} -- investigate before shipping"
    print("PASS: TFLite output matches the original Keras model within tolerance.")

    # Also sanity-check the residual scaler's inverse_transform against sklearn.
    resid_norm = rng.uniform(-2, 2, size=(5, 4)).astype(np.float32)
    sk_inv = ss.inverse_transform(resid_norm)
    np_inv = standard_inverse_transform_numpy(resid_norm, np.array(ss.mean_), np.array(ss.scale_))
    resid_diff = np.abs(sk_inv - np_inv).max()
    print(f"Residual-scaler inverse_transform parity: max abs diff = {resid_diff:.2e}")
    assert resid_diff < 1e-5, f"Residual scaler numpy port diverges by {resid_diff:.2e}"
    print("PASS: numpy scaler port matches sklearn within tolerance.")


if __name__ == "__main__":
    model = convert_model()
    mm, ss = extract_scaler_params()
    parity_check(model, mm, ss)
