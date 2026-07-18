import { z } from 'zod';

// Email validation schema
export const emailSchema = z.string()
  .email('Invalid email address')
  .max(255, 'Email too long')
  .transform(email => email.toLowerCase().trim());

// Password validation schema
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number');

// Name validation schema
export const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters')
  .transform(name => name.trim());

// Commodity name validation
export const commodityNameSchema = z.string()
  .min(1, 'Commodity name is required')
  .max(50, 'Commodity name too long')
  .regex(/^[a-zA-Z0-9\s-_]+$/, 'Invalid commodity name format');

// Quantity validation for trading
export const quantitySchema = z.number()
  .positive('Quantity must be positive')
  .max(1000000, 'Quantity too large')
  .finite('Invalid quantity');

// Price validation
export const priceSchema = z.number()
  .positive('Price must be positive')
  .max(999999999, 'Price too large')
  .finite('Invalid price');

// API key validation
export const apiKeySchema = z.string()
  .min(10, 'API key too short')
  .max(500, 'API key too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key format');

// Content validation for posts/comments
export const contentSchema = z.string()
  .min(1, 'Content is required')
  .max(5000, 'Content too long')
  .transform(content => content.trim());

// Sanitize HTML content
export const sanitizeHtml = (content: string): string => {
  // Remove potentially dangerous tags and attributes
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .trim();
};

// Validate and sanitize form data
export const validateFormData = {
  email: (email: string) => emailSchema.parse(email),
  password: (password: string) => passwordSchema.parse(password),
  name: (name: string) => nameSchema.parse(name),
  commodityName: (name: string) => commodityNameSchema.parse(name),
  quantity: (quantity: number) => quantitySchema.parse(quantity),
  price: (price: number) => priceSchema.parse(price),
  apiKey: (key: string) => apiKeySchema.parse(key),
  content: (content: string) => sanitizeHtml(contentSchema.parse(content)),
};

// Rate limiting validation
export const rateLimitSchema = z.object({
  requests: z.number().max(100, 'Too many requests'),
  timeWindow: z.number().min(60000, 'Rate limit window too short'), // 1 minute minimum
});

// Input sanitization for SQL injection prevention
export const sanitizeForDatabase = (input: string): string => {
  return input
    .replace(/['";\\]/g, '') // Remove SQL injection characters
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*.*?\*\//g, '') // Remove SQL block comments
    .trim();
};

// Validate file uploads
export const fileUploadSchema = z.object({
  name: z.string().max(255, 'Filename too long'),
  size: z.number().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  type: z.enum(['image/jpeg', 'image/png', 'image/webp'] as const, {
    message: 'Invalid file type. Only JPEG, PNG, WebP allowed',
  })
});

// CSRF token validation
export const csrfTokenSchema = z.string()
  .length(32, 'Invalid CSRF token length')
  .regex(/^[a-f0-9]+$/, 'Invalid CSRF token format');

export const validateCsrfToken = (token: string): boolean => {
  try {
    csrfTokenSchema.parse(token);
    return true;
  } catch {
    return false;
  }
};