import os
import uvicorn
import numpy as np
import tensorflow as tf
from tensorflow import keras
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Supabase credentials not found in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# Global variables
model = None
tables_data = []
table_id_map = {}
table_index_map = {}
state_size = 0

# Add CORS Middleware for website to talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins (for demo)
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (POST, GET)
    allow_headers=["*"],
)

@app.on_event("startup")
def load_on_startup():
    global model, tables_data, table_id_map, table_index_map, state_size
    
    model_filepath = "rl_model.h5"
    if not os.path.exists(model_filepath):
        print("Please run 'simulator.py' first to train and create the model.")
        exit()
    
    print(f"Loading trained model from {model_filepath}...")
    model = keras.models.load_model(model_filepath)
    print("AI Model loaded successfully.")
    
    print("Fetching restaurant table configuration from Supabase...")
    try:
        response = supabase.from_("restaurant_tables").select("id, capacity").order("capacity", desc=False).execute()
        if not response.data:
            raise Exception("No tables found in Supabase. AI cannot make decisions.")
            
        tables_data = response.data
        
        # Action 0 is always "DENY"
        for index, table in enumerate(tables_data):
            action_index = index + 1 # +1 to offset "DENY"
            table_id = table['id']
            
            table_id_map[table_id] = action_index
            table_index_map[action_index] = table_id
            
        # Set the state size (5 base features + number of tables)
        state_size = 5 + len(tables_data)
        
        print(f"Restaurant config loaded: {len(tables_data)} tables found.")
        print(f"State size set to: {state_size}")
        print("Server is ready and running!")
        
    except Exception as e:
        print(f"Error on startup: {e}")
        exit()

async def get_customer_history(email: str):
    try:
        response = supabase.from_("reservations") \
            .select("price_paid") \
            .eq("customer_email", email) \
            .eq("status", "completed") \
            .execute()

        if response.data:
            visit_count = len(response.data)
            total_spend = sum(float(item['price_paid']) for item in response.data if item['price_paid'] is not None)
            return visit_count, total_spend
        else:
            return 0, 0 # New customer
    except Exception as e:
        print(f"Error fetching customer history: {e}")
        return 0, 0

async def get_current_table_availability(start_time: datetime, end_time: datetime):
    try:
        # Find all confirmed bookings that overlap with the requested time
        response = supabase.from_("reservations") \
            .select("table_id") \
            .eq("status", "confirmed") \
            .lt("start_time", end_time.isoformat()) \
            .gt("predicted_end_time", start_time.isoformat()) \
            .execute()
            
        if response.data:
            # Return a set of all table IDs that are occupied
            occupied_tables = {item['table_id'] for item in response.data}
            return occupied_tables
        else:
            return set()
    except Exception as e:
        print(f"Error fetching table availability: {e}")
        return set()

@app.get("/")
def read_root():
    return {"message": "ExquiTable Local AI Server is running!"}

@app.post("/get_action")
async def get_ai_action(request: Request):
    try:
        # Parse data
        data = await request.json()
        print(f"\nReceived new booking request: {data}")

        guest_count = int(data['guest_count'])
        customer_email = data['customer_email']
        start_time_str = data['start_time']
        
        # Assume a standard 90-minute duration for checking conflicts
        start_dt = datetime.fromisoformat(start_time_str)
        end_dt = start_dt + timedelta(minutes=90)
        
        # State
        visit_count, total_spend = await get_customer_history(customer_email)
        print(f"Customer History: {visit_count} visits, ${total_spend} total spend.")
        
        base_features = [
            start_dt.weekday(),       # 0=Mon, 6=Sun
            start_dt.hour,            # 17, 18, 19, etc.
            guest_count,
            visit_count,
            total_spend
        ]
        
        occupied_tables = await get_current_table_availability(start_dt, end_dt)
        table_availability_features = []
        for table in tables_data:
            if table['id'] in occupied_tables:
                table_availability_features.append(0) # 0 = Occupied
            elif guest_count > table['capacity']:
                table_availability_features.append(0) # 0 = Too small
            else:
                table_availability_features.append(1) # 1 = Available
        
        state = np.concatenate([base_features, table_availability_features]).reshape(1, -1)
        
        if state.shape[1] != state_size:
            raise Exception(f"State size mismatch! Expected {state_size}, got {state.shape[1]}")

        # Exploitation
        q_values = model.predict(state, verbose=0)[0]
        valid_q_values = q_values.copy()
        
        # Action 0 (DENY) is always valid
        for action_index in range(1, len(valid_q_values)):
            table_index = action_index - 1
            if table_availability_features[table_index] == 0:
                valid_q_values[action_index] = -np.inf # Invalid action
                
        # Choose the best *valid* action
        action = int(np.argmax(valid_q_values))
        
        if action == 0:
            print("AI Action: DENY booking")
            
            await supabase.from_("reservations").insert({
                "customer_email": customer_email,
                "guest_count": guest_count,
                "start_time": start_time_str,
                "status": "denied",
                "price_paid": 0 
            }).execute()
            
            return {"action": "DENY"}
            
        else:
            table_id_to_assign = table_index_map[action]
            print(f"AI Action: ACCEPT and assign to table {table_id_to_assign}")
            
            new_reservation = {
                "customer_email": customer_email,
                "guest_count": guest_count,
                "start_time": start_time_str,
                "predicted_end_time": end_dt.isoformat(),
                "status": "confirmed",
                "table_id": table_id_to_assign
                # 'price_paid' is left NULL until the booking is completed
            }
            response = await supabase.from_("reservations").insert(new_reservation).execute()
            
            return {
                "action": "ACCEPT",
                "table_id": table_id_to_assign,
                "reservation_id": response.data[0]['id']
            }

    except Exception as e:
        print(f"Error in get ai action: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/log_booking_completion")
async def log_booking_completion(request: Request):
    try:
        data = await request.json()
        reservation_id = data['reservation_id']
        price_paid = float(data['price_paid'])
        
        print(f"\nLogging completion for reservation {reservation_id} with reward ${price_paid}")
        
        response = await supabase.from_("reservations") \
            .update({
                "status": "completed",
                "price_paid": price_paid,
                "actual_end_time": datetime.now().isoformat()
            }) \
            .eq("id", reservation_id) \
            .execute()
        
        return {"status": "success"}

    except Exception as e:
        print(f"Error in log_booking_completion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("Starting server... (main.py)")
    # This command starts the local server
    uvicorn.run(app, host="0.0.0.0", port=8000)