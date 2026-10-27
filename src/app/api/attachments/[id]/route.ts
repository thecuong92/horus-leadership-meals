import { NextRequest, NextResponse } from 'next/server';
import { loadAppStateFromServer } from '@/lib/storage-server';
import { RoleKey } from '@/lib/types';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const role = ((req.nextUrl.searchParams.get('role') || 'VIEWER').toUpperCase() as RoleKey);

    const { state } = await loadAppStateFromServer();

    // AC-18: Viewer chưa có quyền xem chứng từ -> Không tải được ảnh qua giao diện lẫn đường dẫn API
    if (role === 'VIEWER' && !state.settings.viewerCanSeeAttachments) {
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

    return NextResponse.json({ attachment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
