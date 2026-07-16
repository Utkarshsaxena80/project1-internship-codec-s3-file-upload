import { NextResponse } from 'next/server';
import { readDb, writeDb, User } from '@/lib/jsonDb';
import { comparePassword, signToken, setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, provider, oauthName } = body;

    const db = readDb();
    let user: User | undefined;

    if (provider) {
      // OAuth Flow
      const oauthEmail = `${provider}-${body.oauthId || 'user'}@example.com`;
      const displayName = oauthName || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Explorer`;

      user = db.users.find((u) => u.email === oauthEmail);

      if (!user) {
        // Auto-register OAuth user
        user = {
          id: `${provider}_${Math.random().toString(36).substring(2, 11)}`,
          email: oauthEmail,
          passwordHash: 'OAUTH_PROVIDER_TOKEN',
          name: displayName,
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        writeDb(db);
      }
    } else {
      // Standard Credentials Flow
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }

      user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user || user.passwordHash === 'OAUTH_PROVIDER_TOKEN') {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const isValid = await comparePassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }
    }

    const token = signToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    const { passwordHash: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
