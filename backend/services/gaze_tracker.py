import os
import time
import threading
from typing import Dict, Any

import cv2
import numpy as np
import mediapipe as mp

# -------------------------
# Shared gaze state
# -------------------------
gaze_lock = threading.Lock()
latest_gaze: Dict[str, Any] = {
    "x": 0.5,           # normalized [0,1]
    "y": 0.5,           # normalized [0,1]
    "calibrated": False,
    "ts_ms": 0
}

# -------------------------
# Calibration state (same idea you had)
# -------------------------
# corners: [tl, tr, bl, br, mid]
corners = []
is_calibrated = False
smooth_x, smooth_y = 0.5, 0.5

# -------------------------
# MediaPipe setup
# -------------------------
BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

LEFT_IRIS = 468
L_INNER, L_OUTER = 133, 33
EYEBROW_STABLE = 107
CHEEKBONE_STABLE = 118

latest_result = None
def result_callback(result, output_image, timestamp_ms):
    global latest_result
    latest_result = result

def get_eye_coords(landmarks):
    iris = landmarks[LEFT_IRIS]
    top = landmarks[EYEBROW_STABLE]
    bot = landmarks[CHEEKBONE_STABLE]
    inner = landmarks[L_INNER]
    outer = landmarks[L_OUTER]

    rx = (iris.x - outer.x) / (inner.x - outer.x)
    ry = (iris.y - top.y) / (bot.y - top.y)
    return rx, ry

def map_to_screen(curr_rx, curr_ry):
    tl, tr, bl, br, mid = corners

    # X split at mid
    if curr_rx < mid[0]:
        left_bound = (tl[0] + bl[0]) / 2
        norm_x = np.interp(curr_rx, [left_bound, mid[0]], [0.0, 0.5])
    else:
        right_bound = (tr[0] + br[0]) / 2
        norm_x = np.interp(curr_rx, [mid[0], right_bound], [0.5, 1.0])

    # Y split at mid
    if curr_ry < mid[1]:
        top_bound = (tl[1] + tr[1]) / 2
        norm_y = np.interp(curr_ry, [top_bound, mid[1]], [0.0, 0.5])
    else:
        bot_bound = (bl[1] + br[1]) / 2
        norm_y = np.interp(curr_ry, [mid[1], bot_bound], [0.5, 1.0])

    return float(norm_x), float(norm_y)

def reset_calibration():
    global corners, is_calibrated, smooth_x, smooth_y
    corners = []
    is_calibrated = False
    smooth_x, smooth_y = 0.5, 0.5
    with gaze_lock:
        latest_gaze["calibrated"] = False

def capture_calibration_point():
    """
    For now: just capture using current latest_result.
    We'll call this from a REST route (/gaze/calibrate/capture).
    """
    global corners, is_calibrated, smooth_x, smooth_y

    if latest_result and latest_result.face_landmarks:
        landmarks = latest_result.face_landmarks[0]
        curr_rx, curr_ry = get_eye_coords(landmarks)
        corners.append([curr_rx, curr_ry])

        if len(corners) == 5:
            is_calibrated = True
            smooth_x, smooth_y = 0.5, 0.5
            with gaze_lock:
                latest_gaze["calibrated"] = True
        return True

    return False

def gaze_loop():
    global is_calibrated, smooth_x, smooth_y

    model_path = os.path.join(os.path.dirname(__file__), "..", "face_landmarker.task")
    model_path = os.path.abspath(model_path)

    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.LIVE_STREAM,
        result_callback=result_callback
    )

    detector = FaceLandmarker.create_from_options(options)
    cap = cv2.VideoCapture(0)

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.01)
                continue

            frame = cv2.flip(frame, 1)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
            detector.detect_async(mp_image, int(time.time() * 1000))

            if latest_result and latest_result.face_landmarks and is_calibrated and len(corners) == 5:
                landmarks = latest_result.face_landmarks[0]
                curr_rx, curr_ry = get_eye_coords(landmarks)
                norm_x, norm_y = map_to_screen(curr_rx, curr_ry)

                smooth_x = (smooth_x * 0.9) + (norm_x * 0.1)
                smooth_y = (smooth_y * 0.82) + (norm_y * 0.18)

                with gaze_lock:
                    latest_gaze["x"] = float(np.clip(smooth_x, 0, 1))
                    latest_gaze["y"] = float(np.clip(smooth_y, 0, 1))
                    latest_gaze["calibrated"] = True
                    latest_gaze["ts_ms"] = int(time.time() * 1000)

            # No imshow here; backend should run headless

    finally:
        detector.close()
        cap.release()

_thread_started = False
def start_gaze_thread():
    global _thread_started
    if _thread_started:
        return
    t = threading.Thread(target=gaze_loop, daemon=True)
    t.start()
    _thread_started = True

def get_latest_gaze_snapshot():
    with gaze_lock:
        return dict(latest_gaze)
