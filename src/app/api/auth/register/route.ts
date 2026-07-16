import { NextResponse } from 'next/server';
import { readDb, writeDb, User } from '@/lib/jsonDb';
import { hashPassword, signToken, setSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const db = readDb();
    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists with this email' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 15),
      email: email.toLowerCase(),
      passwordHash,
      name,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    writeDb(db);

    const token = signToken({ userId: newUser.id, email: newUser.email });
    await setSessionCookie(token);

    // Return user without password hash
    const { passwordHash: _, ...safeUser } = newUser;
    return NextResponse.json({ user: safeUser });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
