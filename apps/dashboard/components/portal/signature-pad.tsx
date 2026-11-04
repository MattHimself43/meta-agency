"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Finger/mouse signature. Writes a PNG data URL into a hidden input named `name`. */
export function SignaturePad({ name }: { name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1430";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    // Belt and braces: whatever happened with pointer events, put the drawing into the submitted form.
    const form = input.current?.form;
    const onData = (e: FormDataEvent) => {
      if (!dirty.current) return;
      e.formData.set(name, c.toDataURL("image/png"));
    };
    form?.addEventListener("formdata", onData);
    return () => form?.removeEventListener("formdata", onData);
  }, [name]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const save = () => {
    if (input.current) input.current.value = canvas.current!.toDataURL("image/png");
  };

  return (
    <div>
      <canvas
        ref={canvas}
        aria-label="Draw your signature"
        className="h-40 w-full touch-none rounded-2xl border border-[var(--line-strong)] bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const p = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = pos(e);
          const ctx = canvas.current!.getContext("2d")!;
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (!dirty.current) setEmpty(false);
          dirty.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          save();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          save();
        }}
        onPointerLeave={() => {
          if (drawing.current) save();
        }}
      />
      <input ref={input} type="hidden" name={name} />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{empty ? "Sign with your finger or mouse" : "Signed"}</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            const c = canvas.current!;
            const ctx = c.getContext("2d")!;
            const r = c.getBoundingClientRect();
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, r.width, r.height);
            if (input.current) input.current.value = "";
            dirty.current = false;
            setEmpty(true);
          }}
        >
          <Eraser /> Clear
        </Button>
      </div>
    </div>
  );
}
