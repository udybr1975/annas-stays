import { createClient } from '@supabase/supabase-js';

// Hardcoding these values to ensure the site renders correctly on Vercel
const supabaseUrl = 'https://bdfvubwnxuzlcngzhiwy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZnZ1YndueHV6bGNuZ3poaXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzI1MjYsImV4cCI6MjA5MDg0ODUyNn0.8LeOCJlZx-8sB6Ty8OVqAkk2mVrk30yWxT99EXUWECE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
