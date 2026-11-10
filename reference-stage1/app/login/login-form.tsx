"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
        <input
          id="email" name="email" type="email" autoComplete="email" required dir="ltr"
          className="w-full rounded border border-line bg-white px-3 py-2 text-start focus:border-forest"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">كلمة المرور</label>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required dir="ltr"
          className="w-full rounded border border-line bg-white px-3 py-2 text-start focus:border-forest"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded bg-st-late/10 px-3 py-2 text-sm text-st-late">{state.error}</p>
      ) : null}
      <button
        type="submit" disabled={pending}
        className="w-full rounded bg-forest px-4 py-2.5 font-medium text-ivory hover:bg-forest-700 disabled:opacity-60"
      >
        {pending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
      </button>
    </form>
  );
}
