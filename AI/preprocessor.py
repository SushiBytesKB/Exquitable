import joblib
import numpy as np
from datetime import datetime, timedelta
from supabase import create_client, Client

class RestaurantPreprocessor:
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase: Client = create_client(supabase_url, supabase_key)
        
        # Load the scalers
        try:
            self.duration_scaler = joblib.load('Models/durationScaler.pkl')
            self.rl_scaler = joblib.load('Models/rlScaler.pkl')
            print("Scalers loaded successfully.")
        except Exception as e:
            print(f"Error loading scalers: {e}")
            raise e

    def fetch_restaurant_seating(self, restaurant_id):
        if not restaurant_id: return []
        
        response = self.supabase.table('restaurant_seating')\
            .select("*")\
            .eq('restaurant_id', restaurant_id)\
            .execute()
        return response.data

    def fetch_customer_history(self, email, restaurant_id):
        if not email or not restaurant_id: return 0, 0.0
        
        # Schema: reservations(price_paid, customer_email, status='completed')
        response = self.supabase.table('reservations')\
            .select("price_paid")\
            .eq("customer_email", email)\
            .eq("restaurant_id", restaurant_id)\
            .eq("status", "completed")\
            .execute()
            
        history = response.data
        if not history: return 0, 0.0
        
        count = len(history)
        total_spend = sum(float(h['price_paid']) for h in history if h['price_paid'] is not None)
        
        return count, (total_spend / count if count > 0 else 0.0)

    def fetch_operating_hours(self, restaurant_id):
        if not restaurant_id:
            return None 
            
        response = self.supabase.table('restaurants')\
            .select("operating_hours")\
            .eq("id", restaurant_id)\
            .maybe_single()\
            .execute()
            
        if response.data:
            return response.data['operating_hours']
        return None

    def calculate_current_occupancy(self, target_time_str, restaurant_id):
        # Fetch seating for THIS restaurant
        seating = self.fetch_restaurant_seating(restaurant_id)
        total_capacity = sum(t['capacity'] for t in seating)
        if total_capacity == 0: return 0.0

        dt_target = datetime.fromisoformat(str(target_time_str).replace('Z', '')).replace(tzinfo=None)
        
        # Filter for bookings that overlap with the target time on this day
        start_of_day = dt_target.replace(hour=0, minute=0, second=0).isoformat()
        end_of_day = dt_target.replace(hour=23, minute=59, second=59).isoformat()

        # Fetch reservations for THIS restaurant
        response = self.supabase.table('reservations')\
            .select("start_time, predicted_end_time, guest_count")\
            .eq('restaurant_id', restaurant_id)\
            .gte("start_time", start_of_day)\
            .lte("start_time", end_of_day)\
            .neq("status", "denied")\
            .neq("status", "cancelled")\
            .execute()
            
        occupied_seats = 0
        for b in response.data:
            # ISO strings for timestamps
            b_start = datetime.fromisoformat(b['start_time'].replace('Z', '')).replace(tzinfo=None)
            
            # Use the stored predicted_end_time IF**** available << (or just do 90 mins lmao)
            if b.get('predicted_end_time'):
                b_end = datetime.fromisoformat(b['predicted_end_time'].replace('Z', '')).replace(tzinfo=None)
            else:
                b_end = b_start + timedelta(minutes=90)

            # Check if Target Time is INSIDE this booking window
            if b_start <= dt_target < b_end:
                # Add the actual guest count (or average if missing)
                occupied_seats += b.get('guest_count', 4)
        
        return min(occupied_seats / total_capacity, 1.0)

    def check_physical_availability(self, table_id, req_start, duration_minutes, existing_bookings):
        req_end = req_start + timedelta(minutes=duration_minutes)
        
        for b in existing_bookings:
            # Only check bookings for THIS table
            if str(b.get('table_id')) != str(table_id): 
                continue 
                
            b_start = datetime.fromisoformat(b['start_time'].replace('Z', '')).replace(tzinfo=None)
            
            if b.get('predicted_end_time'):
                b_end = datetime.fromisoformat(b['predicted_end_time'].replace('Z', '')).replace(tzinfo=None)
            else:
                b_end = b_start + timedelta(minutes=90)
            
            # Overlap when (StartA < EndB) and (EndA > StartB)
            if req_start < b_end and req_end > b_start:
                return False
        return True

    def is_restaurant_open(self, start_dt, duration_minutes, operating_hours):
        if not operating_hours:
            return True 

        day_name = start_dt.strftime("%A").lower()
        
        if day_name not in operating_hours or not operating_hours[day_name]:
            return False 

        hours = operating_hours[day_name]

        try:
            fmt = "%H:%M"
            open_time = datetime.strptime(hours["open"], fmt).time()
            close_time = datetime.strptime(hours["close"], fmt).time()
            
            booking_start = start_dt.time()
            booking_end = (start_dt + timedelta(minutes=duration_minutes)).time()

            if booking_start >= open_time and booking_end <= close_time:
                return True
            return False
            
        except Exception as e:
            print(f"Error parsing hours: {e}")
            return True

    def build_simulation_context(self, request_data, duration_model):
        # Unpack Request
        email = request_data.get('customer_email')
        guests = int(request_data.get('guest_count'))
        start_time_str = request_data.get('start_time')
        is_weekend = 1 if request_data.get('is_weekend') else 0
        restaurant_id = request_data.get('restaurant_id')
        
        res_dt = datetime.fromisoformat(start_time_str.replace('Z', '')).replace(tzinfo=None)
        time_of_day = res_dt.hour + (res_dt.minute / 60.0)
        
        # Fetch DB
        op_hours = self.fetch_operating_hours(restaurant_id)
        visit_count, avg_spend = self.fetch_customer_history(email, restaurant_id)
        occupancy = self.calculate_current_occupancy(start_time_str, restaurant_id)

        # Predict Duration
        duration_features = np.array([[is_weekend, time_of_day, occupancy, guests, visit_count, avg_spend]])
        
        if self.duration_scaler:
            scaled_dur_inputs = self.duration_scaler.transform(duration_features)
            pred_minutes = float(duration_model.predict(scaled_dur_inputs, verbose=0)[0][0])
        else:
            pred_minutes = 90.0
        pred_minutes = max(45, pred_minutes)

        # Check hours
        if not self.is_restaurant_open(res_dt, pred_minutes, op_hours):
             return {
                "state_features": duration_features,
                "predicted_duration": round(pred_minutes),
                "valid_actions": [], # Empty = Denied
                "rl_scaler": self.rl_scaler
            }
        
        # Vlid actions
        seating = self.fetch_restaurant_seating(restaurant_id)
        
        # Fetch Bookings
        start_day = res_dt.replace(hour=0, minute=0).isoformat()
        end_day = res_dt.replace(hour=23, minute=59).isoformat()
        
        bookings_resp = self.supabase.table('reservations')\
            .select("table_id, start_time, predicted_end_time")\
            .eq('restaurant_id', restaurant_id)\
            .gte("start_time", start_day)\
            .lte("start_time", end_day)\
            .neq("status", "denied")\
            .neq("status", "cancelled")\
            .execute()
        existing_bookings = bookings_resp.data
        
        valid_actions = []
        
        # Deny Option
        valid_actions.append({
            "action": "denied",
            "table_id": None,
            "capacity": 0,
            "wasted": 0,
            "raw_features": [is_weekend, time_of_day, occupancy, guests, visit_count, avg_spend, 0, 0]
        })
        
        for table in seating:
            # Capacity Check
            if table['capacity'] < guests: continue 
            
            # Availability Check
            if self.check_physical_availability(table['id'], res_dt, pred_minutes, existing_bookings):
                wasted = table['capacity'] - guests
                valid_actions.append({
                    "action": "confirmed",
                    "table_id": table['id'],
                    "capacity": table['capacity'],
                    "wasted": wasted,
                    "raw_features": [is_weekend, time_of_day, occupancy, guests, visit_count, avg_spend, table['capacity'], wasted]
                })

        return {
            "state_features": duration_features,
            "predicted_duration": round(pred_minutes),
            "valid_actions": valid_actions,
            "rl_scaler": self.rl_scaler
        }