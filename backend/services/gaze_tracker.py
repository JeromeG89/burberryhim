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
    "x": 0.5,
    "y": 0.5,
    "calibrated": False,
    "blink": False,     # NEW: Added blink state
    "ts_ms": 0
}

# -------------------------
# Calibration & MediaPipe Constants
# -------------------------
corners = []
is_calibrated = False
smooth_x, smooth_y = 0.5, 0.5

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

LEFT_IRIS = 468
L_INNER, L_OUTER = 133, 33
EYEBROW_STABLE = 107
CHEEKBONE_STABLE = 118

# Blink Detection Landmarks
L_TOP_LID = 159 
L_BOT_LID = 145
BLINK_THRESHOLD = 0.22 # Sensitivity: lower = harder to blink

latest_result = None
def result_callback(result, output_image, timestamp_ms):
    global latest_result
    latest_result = result

def check_blink(landmarks):
    """Calculates EAR to detect if eye is closed."""
    top = landmarks[L_TOP_LID]
    bot = landmarks[L_BOT_LID]
    inner = landmarks[L_INNER]
    outer = landmarks[L_OUTER]

    # Euclidean distance for Vertical vs Horizontal
    v_dist = np.linalg.norm(np.array([top.x, top.y]) - np.array([bot.x, bot.y]))
    h_dist = np.linalg.norm(np.array([inner.x, inner.y]) - np.array([outer.x, outer.y]))
    
    return float(v_dist / h_dist) < BLINK_THRESHOLD

def get_eye_coords(landmarks):
    iris = landmarks[LEFT_IRIS]
    top, bot = landmarks[EYEBROW_STABLE], landmarks[CHEEKBONE_STABLE]
    inner, outer = landmarks[L_INNER], landmarks[L_OUTER]
    rx = (iris.x - outer.x) / (inner.x - outer.x)
    ry = (iris.y - top.y) / (bot.y - top.y)
    return rx, ry

def map_to_screen(curr_rx, curr_ry):
    tl, tr, bl, br, mid = corners
    if curr_rx < mid[0]:
        norm_x = np.interp(curr_rx, [(tl[0] + bl[0]) / 2, mid[0]], [0.0, 0.5])
    else:
        norm_x = np.interp(curr_rx, [mid[0], (tr[0] + br[0]) / 2], [0.5, 1.0])

    if curr_ry < mid[1]:
        norm_y = np.interp(curr_ry, [(tl[1] + tr[1]) / 2, mid[1]], [0.0, 0.5])
    else:
        norm_y = np.interp(curr_ry, [mid[1], (bl[1] + br[1]) / 2], [0.5, 1.0])
    return float(norm_x), float(norm_y)

def reset_calibration():
    global corners, is_calibrated, smooth_x, smooth_y
    corners = []
    is_calibrated = False
    smooth_x, smooth_y = 0.5, 0.5
    with gaze_lock:
        latest_gaze["calibrated"] = False
        latest_gaze["x"] = 0.5
        latest_gaze["y"] = 0.5
    print("Calibration has been fully reset via long blink.")

def capture_calibration_point():
    global corners, is_calibrated
    if latest_result and latest_result.face_landmarks:
        landmarks = latest_result.face_landmarks[0]
        curr_rx, curr_ry = get_eye_coords(landmarks)
        
        if len(corners) < 5:
            corners.append([curr_rx, curr_ry])
            print(f"Point {len(corners)} captured")
        
        # FIX: Only set this at EXACTLY 5
        if len(corners) == 5:
            is_calibrated = True
            with gaze_lock:
                latest_gaze["calibrated"] = True # Only now does the frontend stop listening
            print("--- FULLY CALIBRATED ---")
        return True
    return False

def gaze_loop():
    global is_calibrated, smooth_x, smooth_y
    model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "face_landmarker.task"))
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
            if not ok: continue
            frame = cv2.flip(frame, 1)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
            detector.detect_async(mp_image, int(time.time() * 1000))

            if latest_result and latest_result.face_landmarks:
                landmarks = latest_result.face_landmarks[0]
                
                # Detect blink every frame
                blinking = check_blink(landmarks)

                if is_calibrated and len(corners) == 5:
                    curr_rx, curr_ry = get_eye_coords(landmarks)
                    norm_x, norm_y = map_to_screen(curr_rx, curr_ry)
                    smooth_x = (smooth_x * 0.9) + (norm_x * 0.1)
                    smooth_y = (smooth_y * 0.82) + (norm_y * 0.18)

                    with gaze_lock:
                        latest_gaze["x"] = float(np.clip(smooth_x, 0, 1))
                        latest_gaze["y"] = float(np.clip(smooth_y, 0, 1))
                        latest_gaze["blink"] = blinking
                        latest_gaze["calibrated"] = True
                        latest_gaze["ts_ms"] = int(time.time() * 1000)
                else:
                    # Update blink even if not calibrated
                    with gaze_lock:
                        latest_gaze["blink"] = blinking
                        latest_gaze["calibrated"] = False
    finally:
        detector.close()
        cap.release()

_thread_started = False
def start_gaze_thread():
    global _thread_started
    if not _thread_started:
        t = threading.Thread(target=gaze_loop, daemon=True)
        t.start()
        _thread_started = True

def get_latest_gaze_snapshot():
    with gaze_lock:
        return dict(latest_gaze)