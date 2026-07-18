UPDATE public.profiles
SET subscription_active = true,
    subscription_tier = 'pro',
    subscription_end = now() + interval '1 year'
WHERE email = 'luka.petek81@gmail.com';