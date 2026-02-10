import cv2
import mediapipe as mp
import time
import numpy as np
import os

# --- INITIALIZE MEDIAPIPE ---
BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

latest_result = None
def result_callback(result, output_image, timestamp_ms):
    global latest_result
    latest_result = result

model_path = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=result_callback
)

# Landmarks
LEFT_IRIS = 468 
L_INNER, L_OUTER = 133, 33
EYEBROW_STABLE = 107
CHEEKBONE_STABLE = 118

detector = FaceLandmarker.create_from_options(options)
cap = cv2.VideoCapture(0)

# --- CALIBRATION STATE ---
# We store the [rel_x, rel_y] of the iris at 4 corners
# 0: Top-Left, 1: Top-Right, 2: Bottom-Left, 3: Bottom-Right
corners = [] 
corner_labels = ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-LEFT", "BOTTOM-RIGHT"]
is_calibrated = False
smooth_x, smooth_y = 0.5, 0.5

def get_eye_coords(landmarks):
    iris = landmarks[LEFT_IRIS]
    top = landmarks[EYEBROW_STABLE]
    bot = landmarks[CHEEKBONE_STABLE]
    inner = landmarks[L_INNER]
    outer = landmarks[L_OUTER]
    
    # Calculate stable relative coordinates
    rx = (iris.x - outer.x) / (inner.x - outer.x)
    ry = (iris.y - top.y) / (bot.y - top.y)
    return rx, ry

while cap.isOpened():
    success, frame = cap.read()
    if not success: break
    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape
    
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
    detector.detect_async(mp_image, int(time.time() * 1000))

    if latest_result and latest_result.face_landmarks:
        landmarks = latest_result.face_landmarks[0]
        curr_rx, curr_ry = get_eye_coords(landmarks)

        if not is_calibrated:
            # 1. STEP-BY-STEP CALIBRATION
            idx = len(corners)
            cv2.putText(frame, f"STARE AT {corner_labels[idx]} AND PRESS 'C'", 
                        (w//4, h//2), 1, 1.5, (0, 255, 255), 2)
            
            # Draw a hint dot at the corner we want
            hint_points = [(50, 50), (w-50, 50), (50, h-50), (w-50, h-50)]
            cv2.circle(frame, hint_points[idx], 20, (0, 165, 255), -1)

            if cv2.waitKey(1) & 0xFF == ord('c'):
                corners.append([curr_rx, curr_ry])
                if len(corners) == 4:
                    is_calibrated = True
                    # Set initial smoothing to center
                    smooth_x, smooth_y = 0.5, 0.5
        else:
            # 2. BILINEAR INTERPOLATION (The Accuracy Fix)
            # Map current iris [rx, ry] to [0.0 - 1.0] based on the 4 corners
            tl, tr, bl, br = corners
            
            # Simple Bilinear approximation
            # Map X based on top and bottom corner widths
            top_x = np.interp(curr_rx, [tl[0], tr[0]], [0, 1])
            bot_x = np.interp(curr_rx, [bl[0], br[0]], [0, 1])
            norm_x = (top_x + bot_x) / 2
            
            # Map Y based on left and right corner heights
            left_y = np.interp(curr_ry, [tl[1], bl[1]], [0, 1])
            right_y = np.interp(curr_ry, [tr[1], br[1]], [0, 1])
            norm_y = (left_y + right_y) / 2

            # 3. VERTICAL BOOST & SMOOTHING
            # Boost vertical sensitivity even further
            norm_y = np.clip((norm_y - 0.5) * 1.4 + 0.5, 0, 1)
            
            smooth_x = (smooth_x * 0.9) + (norm_x * 0.1)
            smooth_y = (smooth_y * 0.85) + (norm_y * 0.15)

            # 4. DRAW
            tx, ty = int(smooth_x * w), int(smooth_y * h)
            cv2.drawMarker(frame, (tx, ty), (0, 0, 255), cv2.MARKER_CROSS, 40, 2)
            cv2.circle(frame, (tx, ty), 12, (0, 255, 0), 2)

    cv2.imshow('Corner Calibrated Tracker', frame)
    if cv2.waitKey(1) & 0xFF == 27: break
    if cv2.waitKey(1) & 0xFF == ord('r'): 
        is_calibrated = False
        corners = []

detector.close()
cap.release()
cv2.destroyAllWindows()