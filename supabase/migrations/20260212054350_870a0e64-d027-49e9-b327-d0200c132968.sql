
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create user_saved_fields table
CREATE TABLE public.user_saved_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  field_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_area NUMERIC NOT NULL DEFAULT 0,
  field_crop TEXT NOT NULL DEFAULT '',
  field_crop_emoji TEXT DEFAULT '',
  field_location TEXT DEFAULT '',
  field_color TEXT DEFAULT '#888888',
  field_coordinates JSONB NOT NULL DEFAULT '[]',
  field_group TEXT,
  field_ndvi_change NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, field_id)
);

ALTER TABLE public.user_saved_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved fields" ON public.user_saved_fields FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved fields" ON public.user_saved_fields FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved fields" ON public.user_saved_fields FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved fields" ON public.user_saved_fields FOR DELETE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_saved_fields_updated_at BEFORE UPDATE ON public.user_saved_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
