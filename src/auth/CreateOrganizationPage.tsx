import { useMemo, useState } from "react";
import { AuthLayout } from "../ui/AuthLayout";
import { PixelButton } from "../ui/PixelButton";
import { PixelField } from "../ui/PixelField";

interface CreateOrganizationPageProps {
  error?: string | null;
  onSubmit: (input: { name: string; slug: string }) => Promise<void>;
}

export function CreateOrganizationPage({ error, onSubmit }: CreateOrganizationPageProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const effectiveSlug = slug || suggestedSlug;

  return (
    <AuthLayout
      title="创建组织"
      subtitle="先创建一个组织空间，再注册设备、分配成员并管理 Agent 运行资产。"
      notice="组织是 Agentlane 权限、邀请、设备 token 与运行资产的管理边界。"
    >
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setIsSubmitting(true);
          void onSubmit({ name, slug: effectiveSlug }).finally(() => setIsSubmitting(false));
        }}
      >
        <PixelField
          icon="blocks"
          label="组织名称"
          name="organization-name"
          placeholder="例如：增长工程组"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <PixelField
          icon="terminal"
          label="组织标识"
          name="organization-slug"
          placeholder="growth-eng"
          value={effectiveSlug}
          onChange={(event) => setSlug(event.currentTarget.value)}
          required
        />
        <PixelButton type="submit" disabled={isSubmitting}>
          创建并进入
        </PixelButton>
      </form>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </AuthLayout>
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
