import { NextRequest, NextResponse } from 'next/server';
import { loadAppStateFromServer } from '@/lib/storage-server';
import { RoleKey } from '@/lib/types';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const explicitRole = req.nextUrl.searchParams.get('role')?.toUpperCase() as RoleKey | undefined;
    const wantsDirectImage =
      req.nextUrl.searchParams.get('view') === '1' ||
      req.nextUrl.searchParams.get('raw') === '1';

    const { state } = await loadAppStateFromServer();

    // AC-18: Viewer chưa có quyền xem chứng từ -> Không tải được ảnh qua giao diện lẫn đường dẫn API
    if (explicitRole === 'VIEWER' && !state.settings.viewerCanSeeAttachments) {
      return NextResponse.json(
        {
          error:
            'AC-18: Tài khoản Viewer chưa được cấp quyền xem/tải ảnh thanh toán và hóa đơn.',
        },
        { status: 403 }
      );
    }

    const attachment = state.attachments.find((a) => a.id === id);
    if (!attachment) {
      return NextResponse.json({ error: 'Không tìm thấy chứng từ.' }, { status: 404 });
    }

    if (wantsDirectImage && attachment.dataUrl && attachment.dataUrl.startsWith('data:')) {
      const commaIdx = attachment.dataUrl.indexOf(',');
      const header = attachment.dataUrl.slice(5, commaIdx);
      const dataPart = attachment.dataUrl.slice(commaIdx + 1);
      const isBase64 = header.includes(';base64');
      const mimeType = header.split(';')[0] || 'image/jpeg';
      const buf = isBase64
        ? Buffer.from(dataPart, 'base64')
        : Buffer.from(decodeURIComponent(dataPart), 'utf-8');
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        },
      });
    }

    return NextResponse.json({ attachment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
