'use client';

import { useState } from 'react';
import { ComposerEditor } from './composer-editor';

export function ComposerDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  return (
    <div className="page">
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        打开对话框
      </button>

      {result ? (
        <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>
      ) : null}

      {open ? (
        <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>新建内容</h2>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>

            <ComposerEditor
              onClose={() => setOpen(false)}
              onSubmit={async (payload) => {
                setResult(payload);
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
