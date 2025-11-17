import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from keras import layers
import random
import os
from collections import deque
from supabase import create_client, Client
from dotenv import load_dotenv
import datetime
import json

# Hyperparameters
EPISODES = 5000
MAX_STEPS_PER_DAY = 50
SIMULATED_DURATION = 3
REPLAY_MEMORY_SIZE = 10000
MIN_REPLAY_MEMORY_SIZE = 1000
BATCH_SIZE = 64
GAMMA = 0.99
LEARNING_RATE = 0.001
UPDATE_TARGET_EVERY = 5
EPSILON_START = 1.0
EPSILON_END = 0.01
EPSILON_DECAY_RATE = 0.9995

# Supabase
print("Connecting to Supabase...")
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("Supabase credentials not found in .env file")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("Supabase connection successful.")

# Restaurant Env
class RestaurantEnvironment:
    def __init__(self, table_data):
        self.tables = table_data
        self.table_id_map = {table['id']: index for index, table in enumerate(self.tables)}
        self.table_index_map = {index: table['id'] for index, table in enumerate(self.tables)}
        
        self.num_tables = len(self.tables)
        
        # Action 0 = DENY booking
        # Action 1 = Assign to table 1, Action 2 = Assign to table 2, etc.
        self.num_actions = self.num_tables + 1 
        
        # State:
        # [day_of_week, time_of_day, req_guest_count, cust_visit_count, cust_total_spend]
        # + one slot for each table's availability (0=occupied, 1=free)
        self.state_size = 5 + self.num_tables
        
        self.reset()

    def reset(self):
        self.table_state = np.zeros(self.num_tables) # 0 = free
        self.current_step = 0
        self.current_booking_request = self._generate_fake_booking()
        return self._get_state()

    def _get_state(self):
        table_availability = (self.table_state == 0).astype(int)
        
        booking = self.current_booking_request
        state_features = [
            booking['day_of_week'],
            booking['time_of_day'],
            booking['guest_count'],
            booking['visit_count'],
            booking['total_spend']
        ]
        
        state = np.concatenate([state_features, table_availability]).reshape(1, -1)
        return state

    def _generate_fake_booking(self):
        if random.random() < 0.8:
            visit_count = 0
            total_spend = 0
        else:
            visit_count = random.randint(1, 15)
            total_spend = random.randint(50, 2000)
            
        return {
            'day_of_week': random.randint(0, 6),
            'time_of_day': random.randint(17, 22),
            'guest_count': random.randint(1, 8),
            'visit_count': visit_count,
            'total_spend': total_spend
        }

    def step(self, action):
        self.current_step += 1
        booking = self.current_booking_request
        guest_count = booking['guest_count']
        
        reward = 0
        done = False
        
        if action == 0:
            # DENY booking
            if booking['visit_count'] > 5:
                reward = -20 # Penalty for denying a regular
            else:
                reward = -1 
        else:
            # ACCEPT booking
            table_index = action - 1
            table = self.tables[table_index]
            
            if self.table_state[table_index] > 0:
                reward = -200 # Heavy penalty for double-booking
            elif guest_count > table['capacity']:
                reward = -150 # Heavy penalty for bad assignment
            else:
                profit = guest_count * 15
                profit += booking['visit_count'] * 2
                if booking['total_spend'] > 1000:
                    profit += 50 
                reward = profit
                self.table_state[table_index] = SIMULATED_DURATION

        # "Cool down" all occupied tables
        self.table_state = np.maximum(0, self.table_state - 1)
        self.current_booking_request = self._generate_fake_booking()
        
        if self.current_step >= MAX_STEPS_PER_DAY:
            done = True
        
        next_state = self._get_state()
        
        return next_state, reward, done

# Agent
class DQNAgent:
    def __init__(self, state_size, action_size):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=REPLAY_MEMORY_SIZE)
        self.epsilon = EPSILON_START
        self.model = self._build_model()
        self.target_model = self._build_model()
        self.target_model.set_weights(self.model.get_weights())

    def _build_model(self):
        model = keras.Sequential([
            layers.Input(shape=(self.state_size,)),
            layers.Dense(128, activation='relu'),
            layers.Dense(64, activation='relu'),
            layers.Dense(self.action_size, activation='linear')
        ])
        model.compile(loss='mse', optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE))
        return model

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def choose_action(self, state, is_training=True):
        if is_training and np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size)
        q_values = self.model.predict(state, verbose=0)
        return np.argmax(q_values[0])

    def learn_from_replay(self):
        if len(self.memory) < MIN_REPLAY_MEMORY_SIZE:
            return
        
        minibatch = random.sample(self.memory, BATCH_SIZE)
        
        current_states = np.array([transition[0] for transition in minibatch]).reshape(-1, self.state_size)
        current_q_values = self.model.predict(current_states, verbose=0)
        
        next_states = np.array([transition[3] for transition in minibatch]).reshape(-1, self.state_size)
        next_q_values = self.target_model.predict(next_states, verbose=0)
        
        X = []
        y = []
        
        for index, (state, action, reward, next_state, done) in enumerate(minibatch):
            if not done:
                max_future_q = np.max(next_q_values[index])
                new_q = reward + GAMMA * max_future_q
            else:
                new_q = reward
            
            current_q = current_q_values[index]
            current_q[action] = new_q
            
            X.append(state)
            y.append(current_q)
            
        self.model.fit(np.array(X).reshape(-1, self.state_size), np.array(y), 
                       batch_size=BATCH_SIZE, verbose=0, shuffle=False)

    def update_target_model(self):
        self.target_model.set_weights(self.model.get_weights())

    def decay_epsilon(self):
        if self.epsilon > EPSILON_END:
            self.epsilon *= EPSILON_DECAY_RATE
            
    def load_model(self, filepath):
        print(f"Loading model from {filepath}...")
        self.model = keras.models.load_model(filepath)
        self.target_model = keras.models.load_model(filepath)
        self.epsilon = EPSILON_END

    def save_model(self, filepath):
        print(f"\nSaving model to {filepath}...")
        self.model.save(filepath)

# Main training
def fetch_table_data():
    print("Fetching restaurant table data from Supabase...")
    try:
        tables = supabase.from_("restaurant_tables").select("id, capacity").order("capacity", desc=False).execute()
        if not tables.data:
            raise Exception("No tables found in Supabase. Please add tables.")
        
        print(f"Found {len(tables.data)} tables.")
        return tables.data
    except Exception as e:
        print(f"Error fetching tables: {e}")
        return None

def fine_tune_from_supabase(agent, env):
    print("Fetching real-world training data from Supabase...")
    try:
        # Fetch all 'completed' or 'denied' reservations
        response = supabase.from_("reservations").select("*").in_("status", ["completed", "denied"]).execute()
        if not response.data:
            print("No real-world data found in Supabase. Starting fresh training.")
            return

        print(f"Found {len(response.data)} real-world experiences. Adding to memory...")

        for res in response.data:
            if res['status'] == 'denied':
                action = 0 # 0 is the "DENY" action
            elif res['table_id'] in env.table_id_map:
                action = env.table_id_map[res['table_id']] + 1 # +1 to offset "DENY"
            else:
                continue

            reward = float(res['price_paid']) if res['price_paid'] else 0
            if res['status'] == 'denied':
                reward = 0

            # --- Re-construct the State ---
            # This is the hardest part. We don't know the *full* state
            # (e.g., table availability) at the moment of booking.
            # FOR THIS PROJECT: We will use a *simplified* state based
            # on the customer's known profile.
            
            # This requires a new function in main.py to get customer history.
            # For the simulator, we will just print a log.
            # A full implementation would query customer history for each row.
            
            # --- Simplified "Remember" ---
            # Because reconstructing the *exact* state is complex,
            # we will print a log. In a full system, you would store
            # the *state itself* as a JSONB object in the 'reservations' table
            # at the time of booking.
            pass

        # Since state reconstruction is too complex for this script,
        # we will skip pre-loading the memory for now.
        print("Real-world data found, but pre-loading memory is a complex")
        print("feature. For the demo, we will rely on the simulator.")
        print("In a V2, 'main.py' would save the full 'state' object to")
        print("Supabase, making this function much easier.")

    except Exception as e:
        print(f"Error fetching Supabase data: {e}")

if __name__ == "__main__":
    
    MODEL_FILEPATH = "rl_model.h5"
    
    table_data = fetch_table_data()
    if not table_data:
        exit()
        
    env = RestaurantEnvironment(table_data)
    agent = DQNAgent(env.state_size, env.num_actions)

    if os.path.exists(MODEL_FILEPATH):
        try:
            agent.load_model(MODEL_FILEPATH)
        except Exception as e:
            print(f"Error loading model: {e}. Starting new model.")
            
    fine_tune_from_supabase(agent, env)

    print(f"\n--- Starting Training for {EPISODES} Episodes (Days) ---")
    
    for episode in range(1, EPISODES + 1):
        state = env.reset()
        total_reward = 0
        done = False
        
        while not done:
            action = agent.choose_action(state, is_training=True)
            next_state, reward, done = env.step(action)
            agent.remember(state, action, reward, next_state, done)
            agent.learn_from_replay()
            state = next_state
            total_reward += reward

        agent.decay_epsilon()

        if episode % UPDATE_TARGET_EVERY == 0:
            agent.update_target_model()
            
        print(f"Episode: {episode}/{EPISODES} | Total Profit: ${total_reward:.2f} | Epsilon: {agent.epsilon:.4f}")

        if episode % 50 == 0:
            agent.save_model(MODEL_FILEPATH)

    print("\n--- Training Complete ---")
    agent.save_model(MODEL_FILEPATH)