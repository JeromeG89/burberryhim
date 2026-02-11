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
# Points: 0:TL, 1:TR, 2:BL, 3:BR, 4:CENTER
corners = [] 
corner_labels = ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-LEFT", "BOTTOM-RIGHT", "CENTER"]
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

win = '5-Point Gaze Tracker'
cv2.namedWindow(win, cv2.WINDOW_NORMAL)
cv2.setWindowProperty(win, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)


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
            # 1. 5-POINT CALIBRATION SEQUENCE
            idx = len(corners)
            cv2.putText(frame, f"STARE AT {corner_labels[idx]} AND PRESS 'C'", 
                        (w//6, h//2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            
            # Calibration point hints
            hint_points = [(50, 50), (w-50, 50), (50, h-50), (w-50, h-50), (w//2, h//2)]
            cv2.circle(frame, hint_points[idx], 20, (0, 165, 255), -1)

            if cv2.waitKey(1) & 0xFF == ord('c'):
                corners.append([curr_rx, curr_ry])
                if len(corners) == 5:
                    is_calibrated = True
                    smooth_x, smooth_y = 0.5, 0.5
        else:
            # 2. PIECEWISE LINEAR INTERPOLATION (The Accuracy Fix)
            # tl=0, tr=1, bl=2, br=3, mid=4
            tl, tr, bl, br, mid = corners
            
            # --- Map X (Split at calibrated Center) ---
            if curr_rx < mid[0]:
                # Left half of screen: map from left bounds to center
                left_bound = (tl[0] + bl[0]) / 2
                norm_x = np.interp(curr_rx, [left_bound, mid[0]], [0, 0.5])
            else:
                # Right half of screen: map from center to right bounds
                right_bound = (tr[0] + br[0]) / 2
                norm_x = np.interp(curr_rx, [mid[0], right_bound], [0.5, 1])
            
            # --- Map Y (Split at calibrated Center) ---
            if curr_ry < mid[1]:
                # Top half: map from top bounds to center
                top_bound = (tl[1] + tr[1]) / 2
                norm_y = np.interp(curr_ry, [top_bound, mid[1]], [0, 0.5])
            else:
                # Bottom half: map from center to bottom bounds
                bot_bound = (bl[1] + br[1]) / 2
                norm_y = np.interp(curr_ry, [mid[1], bot_bound], [0.5, 1])

            # 3. SMOOTHING
            # X is usually stable; Y needs faster response to feel accurate
            smooth_x = (smooth_x * 0.9) + (norm_x * 0.1)
            smooth_y = (smooth_y * 0.82) + (norm_y * 0.18) 

            # 4. DRAW
            tx, ty = int(np.clip(smooth_x, 0, 1) * w), int(np.clip(smooth_y, 0, 1) * h)
            cv2.drawMarker(frame, (tx, ty), (0, 0, 255), cv2.MARKER_CROSS, 40, 2)
            cv2.circle(frame, (tx, ty), 12, (0, 255, 0), 2)

    cv2.imshow(win, frame)

    if cv2.waitKey(1) & 0xFF == 27: break
    if cv2.waitKey(1) & 0xFF == ord('r'): 
        is_calibrated = False
        corners = []

detector.close()
cap.release()
cv2.destroyAllWindows()