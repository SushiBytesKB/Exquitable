import os
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from preprocessor import RestaurantPreprocessor
from agent import ProfitAgent

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize AI Components
preprocessor = RestaurantPreprocessor(
    supabase_url=os.getenv("SUPABASE_URL"),
    supabase_key=os.getenv("SUPABASE_KEY")
)

agent = ProfitAgent(
    duration_model_path='Models/durationPredictor.h5',
    rl_model_path='Models/decisionDQN.h5'
)

print("ExquiTable AI Server is running.")

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "online"}), 200

@app.route('/decide_booking', methods=['POST'])
def decide_booking():
    try:
        data = request.json
        
        email = data.get('customer_email')
        guests = data.get('guest_count')
        rest_id = data.get('restaurant_id')
        
        if not email or not guests:
            return jsonify({"error": "Missing data points'"}), 400

        print(f"\nRequest: {email} for {guests} guests at {rest_id} restaurant ID.")

        # Build Context
        context = preprocessor.build_simulation_context(data, agent.duration_model)
        
        if not context['valid_actions']:
            return jsonify({
                "action": "denied",
                "table_id": None,
                "reason": "No availability."
            })

        # AI Decision
        best_decision = agent.get_best_action(
            state_features=context['state_features'],
            valid_actions=context['valid_actions'],
            scaler=context['rl_scaler']
        )

        print(f"AI Decision: {best_decision['action'].upper()} (Table {best_decision['table_id']})")
        
        return jsonify({
            "action": best_decision['action'], # 'confirmed' or 'denied'
            "table_id": best_decision['table_id'],
            "assigned_capacity": best_decision['capacity'],
            "predicted_duration": context['predicted_duration'],
            "ai_confidence_score": float(best_decision.get('predicted_value', 0))
        })

    except Exception as e:
        print(f"Error: {str(e)}")
        traceback.print_exc() # for debug
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)