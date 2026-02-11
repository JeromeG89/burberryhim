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
# Specific eyelid landmarks for blink detection
L_TOP_LID, L_BOT_LID = 159, 145

detector = FaceLandmarker.create_from_options(options)
cap = cv2.VideoCapture(0)

# --- CALIBRATION STATE ---
corners = [] 
corner_labels = ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-LEFT", "BOTTOM-RIGHT", "CENTER"]
is_calibrated = False
smooth_x, smooth_y = 0.5, 0.5

# Blink Detection Threshold
# Lowering this makes it less sensitive (harder to blink), raising makes it more sensitive.
BLINK_THRESHOLD = 0.22 

def get_eye_coords(landmarks):
    iris = landmarks[LEFT_IRIS]
    top = landmarks[EYEBROW_STABLE]
    bot = landmarks[CHEEKBONE_STABLE]
    inner = landmarks[L_INNER]
    outer = landmarks[L_OUTER]
    
    rx = (iris.x - outer.x) / (inner.x - outer.x)
    ry = (iris.y - top.y) / (bot.y - top.y)
    return rx, ry

def check_blink(landmarks):
    """Calculates the Eye Aspect Ratio (EAR) to detect blinks."""
    top, bot = landmarks[L_TOP_LID], landmarks[L_BOT_LID]
    inner, outer = landmarks[L_INNER], landmarks[L_OUTER]
    
    # Vertical distance vs Horizontal distance
    v_dist = np.linalg.norm(np.array([top.x, top.y]) - np.array([bot.x, bot.y]))
    h_dist = np.linalg.norm(np.array([inner.x, inner.y]) - np.array([outer.x, outer.y]))
    
    ear = v_dist / h_dist
    return ear < BLINK_THRESHOLD

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
        
        # --- NEW: DETECT BLINK ---
        is_blinking = check_blink(landmarks)

        if not is_calibrated:
            idx = len(corners)
            cv2.putText(frame, f"STARE AT {corner_labels[idx]} AND PRESS 'C'", 
                        (w//6, h//2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            
            hint_points = [(50, 50), (w-50, 50), (50, h-50), (w-50, h-50), (w//2, h//2)]
            cv2.circle(frame, hint_points[idx], 20, (0, 165, 255), -1)

            if cv2.waitKey(1) & 0xFF == ord('c'):
                corners.append([curr_rx, curr_ry])
                if len(corners) == 5:
                    is_calibrated = True
                    smooth_x, smooth_y = 0.5, 0.5
        else:
            tl, tr, bl, br, mid = corners
            
            # Map X
            if curr_rx < mid[0]:
                left_bound = (tl[0] + bl[0]) / 2
                norm_x = np.interp(curr_rx, [left_bound, mid[0]], [0, 0.5])
            else:
                right_bound = (tr[0] + br[0]) / 2
                norm_x = np.interp(curr_rx, [mid[0], right_bound], [0.5, 1])
            
            # Map Y
            if curr_ry < mid[1]:
                top_bound = (tl[1] + tr[1]) / 2
                norm_y = np.interp(curr_ry, [top_bound, mid[1]], [0, 0.5])
            else:
                bot_bound = (bl[1] + br[1]) / 2
                norm_y = np.interp(curr_ry, [mid[1], bot_bound], [0.5, 1])

            # Smoothing
            smooth_x = (smooth_x * 0.9) + (norm_x * 0.1)
            smooth_y = (smooth_y * 0.82) + (norm_y * 0.18) 

            # Drawing
            tx, ty = int(np.clip(smooth_x, 0, 1) * w), int(np.clip(smooth_y, 0, 1) * h)
            
            # Change visual feedback if blinking
            if is_blinking:
                # Big Red indicator for a "Click"
                cv2.circle(frame, (tx, ty), 20, (0, 0, 255), -1)
                cv2.putText(frame, "CLICK!", (tx + 25, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
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