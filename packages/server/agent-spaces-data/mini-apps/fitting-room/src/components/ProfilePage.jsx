import Style from "./Style";
import { resolveUploadItem, persistableFiles } from "../utils/helpers";

const {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FileUpload,
  Trash2,
  Loader2,
  Save,
  User,
  Check,
  ImagePlus,
} = window.AgentSpacesUI;

const PROFILE_PATH = "profile.json";

const defaultProfile = {
  gender: "",
  height: "",
  weight: "",
  bust: "",
  waist: "",
  hip: "",
  photos: [],
};

export default function ProfilePage() {
  const AS = window.AgentSpaces;
  const [profile, setProfile] = React.useState(defaultProfile);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const initial = AS.getConfig?.(PROFILE_PATH);
    if (initial && typeof initial === "object") {
      setProfile({ ...defaultProfile, ...initial });
    }
    const off = AS.onConfigChanged?.((path, value) => {
      if (path === PROFILE_PATH && value && typeof value === "object") {
        setProfile({ ...defaultProfile, ...value });
      }
    });
    return () => off?.();
  }, []);

  const update = (patch) => setProfile((prev) => ({ ...prev, ...patch }));

  const onPhotosChange = (files) => {
    update({ photos: files });
    Promise.all((files || []).map(resolveUploadItem))
      .then(() => {
        setProfile((prev) => ({ ...prev, photos: persistableFiles(prev.photos) }));
      })
      .catch(() => {});
  };

  const removePhoto = (id) => {
    update({ photos: (profile.photos || []).filter((p) => p.id !== id) });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const photos = await Promise.all((profile.photos || []).map(resolveUploadItem));
      await AS.invokeService("save_profile", {
        gender: profile.gender,
        height: profile.height,
        weight: profile.weight,
        bust: profile.bust,
        waist: profile.waist,
        hip: profile.hip,
        photos: photos.map((p) => ({ url: p.url, path: p.path, name: p.name })),
      });
      setStatus("已保存");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fr-grid-1">
      <Style />
      <div className="fr-panel">
        <div className="fr-panel-title">
          <User className="fr-icon" />
          <span>体型信息</span>
        </div>
        <div className="fr-subtitle">用于生成更贴合你身材的效果图</div>

        <div className="fr-field">
          <Label>性别</Label>
          <Select value={profile.gender} onValueChange={(value) => update({ gender: value })}>
            <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">男</SelectItem>
              <SelectItem value="female">女</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="fr-field-row">
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>身高 (cm)</Label>
            <Input
              type="number"
              value={profile.height}
              onChange={(e) => update({ height: e.target.value })}
              placeholder="如 170"
            />
          </div>
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>体重 (kg)</Label>
            <Input
              type="number"
              value={profile.weight}
              onChange={(e) => update({ weight: e.target.value })}
              placeholder="如 60"
            />
          </div>
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>胸围 (cm)</Label>
            <Input
              type="number"
              value={profile.bust}
              onChange={(e) => update({ bust: e.target.value })}
              placeholder="如 90"
            />
          </div>
        </div>

        <div className="fr-field-row">
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>腰围 (cm)</Label>
            <Input
              type="number"
              value={profile.waist}
              onChange={(e) => update({ waist: e.target.value })}
              placeholder="如 70"
            />
          </div>
          <div className="fr-field" style={{ margin: 0 }}>
            <Label>臀围 (cm)</Label>
            <Input
              type="number"
              value={profile.hip}
              onChange={(e) => update({ hip: e.target.value })}
              placeholder="如 95"
            />
          </div>
        </div>

        {error && <div className="fr-error">{error}</div>}
        {status && <div className="fr-status"><Check className="fr-icon" />{status}</div>}

        <div className="fr-actions">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="fr-icon fr-spin" /> : <Save className="fr-icon" />}
            保存形象
          </Button>
        </div>
      </div>

      <div className="fr-panel" style={{ marginTop: 20 }}>
        <div className="fr-section-head">
          <div className="fr-section-title">
            <ImagePlus className="fr-icon" />
            <span>我的照片</span>
          </div>
          {uploading && (
            <span className="fr-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Loader2 className="fr-icon fr-spin" />上传中...
            </span>
          )}
        </div>
        <div className="fr-caption" style={{ marginBottom: 12 }}>
          上传多张全身/半身照片，作为发型、服装生成的形象参考。
        </div>
        <FileUpload
          value={profile.photos}
          onChange={onPhotosChange}
          onUploadStatusChange={(s) => setUploading(!!s?.uploading)}
          autoUpload
          accept="image/*"
          maxFiles={20}
          placeholder="拖拽照片到此处，或点击选择（可多选）"
        />

        {(!profile.photos || profile.photos.length === 0) ? (
          <div className="fr-empty" style={{ minHeight: 200 }}>
            还没有照片，点击"添加照片"上传
          </div>
        ) : (
          <div className="fr-photo-grid">
            {profile.photos.map((item) => {
              const file = item?.file || item;
              const url = file?.uploadedHttpPath || file?.uploadedUrl || file?.httpPath || file?.url;
              return (
                <div className="fr-photo" key={item.id || url}>
                  <img src={url} alt={file?.name || "photo"} />
                  <button
                    className="fr-photo-del"
                    title="删除"
                    onClick={() => removePhoto(item.id)}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
