import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
// Client can be created via that import ^

//const SUPABASE_URL = "https://kkkuituqlmsvdgfulzii.supabase.co"; // This is the project url thing?
const SUPABASE_URL = "https://kkxjmydaqooqmmuhwhck.supabase.co"



//const SUPABASE_ANON_KEY =
//  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtra3VpdHVxbG1zdmRnZnVsemlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NzcxODIsImV4cCI6MjA3ODA1MzE4Mn0.L69KkL1ZU6JGVXxvdT15SrRrVXC_6vT0jzbNP7lOpPM";
// pick the safe anon key ^ (we are doing RLS)

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreGpteWRhcW9vcW1tdWh3aGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NzA4MDMsImV4cCI6MjA3ODA0NjgwM30.dnwJGEJnTa4hUnkt38UQkkihNCDWj4VngnH1DWZb5e4"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
