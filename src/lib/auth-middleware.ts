import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { users, shifts, notes, proposals, marketOffers, controlEvents } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: any; // The database user object
}

function simplifyPolishChars(str: string): string {
  const mapping: { [key: string]: string } = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'a', 'Ć': 'c', 'Ę': 'e', 'Ł': 'l', 'Ń': 'n', 'Ó': 'o', 'Ś': 's', 'Ź': 'z', 'Ż': 'z',
    'ё': 'e', 'е': 'e', 'и': 'i', 'й': 'j', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh',
    'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return str.split('').map(char => mapping[char] || char).join('');
}

function generateCompanyEmail(fullName: string): string {
  // Split case boundaries (e.g., "YuliiaHrabevnyk" -> "Yuliia Hrabevnyk")
  let spaced = fullName.trim().replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Simplify Polish and accents
  let normalized = simplifyPolishChars(spaced);
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
  
  // Lowercase and strip non-alphanumeric except spaces, dots, dashes
  normalized = normalized.toLowerCase().replace(/[^a-z0-9\s\.\-]/g, '').trim();
  
  // Split into words
  const parts = normalized.split(/[\s\.\-]+/).filter(Boolean);
  if (parts.length === 0) {
    return 'user@lot.pl';
  }
  
  if (parts.length >= 2) {
    const firstLetter = parts[0].substring(0, 1);
    const lastName = parts.slice(1).join('');
    return `${firstLetter}.${lastName}@lot.pl`.replace(/\.+/g, '.');
  } else {
    return `${parts[0]}@lot.pl`;
  }
}

export const authGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Auth token expired or invalid (missing)' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    let decodedToken: any = null;

    try {
      const payloadStr = Buffer.from(token, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadStr);
      decodedToken = { 
        email: payload.email, 
        name: payload.full_name,
        user_id: payload.user_id 
      };
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // Check if the user exists in our SQL database
    let dbUser = null;

    if (decodedToken.user_id) {
      const results = await db.select().from(users).where(eq(users.id, Number(decodedToken.user_id)));
      if (results && results.length > 0) {
        dbUser = results[0];
      }
    }

    if (!dbUser) {
      return res.status(401).json({ error: 'User could not be initialized in system' });
    }

    // Attach to req
    req.user = dbUser;
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'Auth token expired or invalid' });
  }
};
