import tensorflow as tf
import numpy as np

class ProfitAgent:
    def __init__(self, duration_model_path, rl_model_path):
        print("Loading AI Models...")
        try:
            # Load the .h5 files downloaded from Colab
            self.duration_model = tf.keras.models.load_model(duration_model_path, compile=False)
            self.rl_model = tf.keras.models.load_model(rl_model_path, compile=False)
            print("Models loaded successfully.")
        except Exception as e:
            print(f"Error loading models: {e}")
            raise e
        
    def get_best_action(self, state_features, valid_actions, scaler):
        if not valid_actions:
            return {"action": "reject", "table_id": None, "predicted_value": 0}

        # Extract raw features from all valid actions
        raw_inputs = [action['raw_features'] for action in valid_actions]
        raw_inputs_array = np.array(raw_inputs)

        # Scale them all at once
        scaled_inputs = scaler.transform(raw_inputs_array)

        # Batch Predict
        predictions = self.rl_model.predict(scaled_inputs, verbose=0)

        # Find the Best
        best_score = -float('inf')
        best_action = None

        for i, score in enumerate(predictions):
            # score is a list like [50.5]
            val = float(score[0])
            
            # Update "valid_actions" with the score for debugging
            valid_actions[i]['predicted_value'] = val
            
            if val > best_score:
                best_score = val
                best_action = valid_actions[i]

        return best_action