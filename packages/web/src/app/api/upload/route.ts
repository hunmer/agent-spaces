import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: 'No file provided' },
      { status: 400 },
    );
  }

  const url = `/mock-upload/${Date.now()}-${encodeURIComponent(file.name)}`;

  return NextResponse.json({
    name: file.name,
    size: file.size,
    type: file.type,
    url,
  });
}
