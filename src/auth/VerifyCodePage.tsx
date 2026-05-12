import { useState } from "react";
import { AuthLayout } from "../ui/AuthLayout";
import { PixelButton } from "../ui/PixelButton";
import { PixelField } from "../ui/PixelField";
import { AuthOperationsPreview } from "./auth-preview";

interface VerifyCodePageProps {
  email: string;
  error?: string | null;
  onBack: () => void;
  onSubmit: (code: string) => Promise<void>;
}

export function VerifyCodePage({ email, error, onBack, onSubmit }: VerifyCodePageProps) {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AuthLayout
      title="输入验证码"
      subtitle={`验证码已发送到 ${email}，10 分钟内有效。`}
      preview={<AuthOperationsPreview />}
      notice="验证通过后会自动进入控制台；若账号还没有组织，需要先创建或加入组织。"
    >
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setIsSubmitting(true);
          void onSubmit(code).finally(() => setIsSubmitting(false));
        }}
      >
        <PixelField
          label="验证码"
          name="code"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="6 位验证码"
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          required
        />
        <div className="auth-actions">
          <PixelButton type="submit" disabled={isSubmitting}>
            进入控制台
          </PixelButton>
          <PixelButton type="button" variant="secondary" onClick={onBack}>
            换个邮箱
          </PixelButton>
        </div>
      </form>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </AuthLayout>
  );
}
