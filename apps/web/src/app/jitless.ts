import { z } from 'zod';

// The page's policy forbids eval. zod would try `new Function` to speed up parsing when a schema is created, be
// refused by the browser and fall back, leaving errors in the console of every visitor. This switches the probe off.
// It has to run before any module that creates schemas, so main.tsx imports it first.
z.config({ jitless: true });
