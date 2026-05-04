"use client";

import { useCallback, useEffect, useState } from "react";
import districts from "@/data/districts.json";
import DistrictSelector from "@/components/DistrictSelector";
import {
  PROFILE_LIMITS,
  createProfile,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  renameProfile,
  setActiveProfile,
  setProfileDistrict,
  type Profile,
  type ProfileMutationError,
} from "@/lib/profiles";

const ERROR_MESSAGES: Record<ProfileMutationError, string> = {
  "name-empty": "名前を入力してください。",
  "name-too-long": `名前は ${PROFILE_LIMITS.maxNameLength} 文字以内で入力してください。`,
  "limit-reached": `プロファイルは最大 ${PROFILE_LIMITS.maxProfiles} 件までです。`,
  "duplicate-name": "同じ名前のプロファイルが既にあります。",
  "not-found": "対象のプロファイルが見つかりません。",
};

const DISTRICT_LABEL_BY_ID = new Map<string, string>(
  (districts as Array<{ id: string; label: string }>).map((d) => [
    d.id,
    d.label,
  ]),
);

type EditorTarget =
  | { mode: "create"; suggestedName: string }
  | { mode: "edit-district"; profile: Profile };

export type ProfileManagerProps = {
  // Notified whenever the visible roster changes (create / rename / delete /
  // active switch / district change). The /settings parent uses it to keep
  // the PushOptIn district prop in sync.
  onChange?: (active: Profile | null) => void;
};

export default function ProfileManager({ onChange }: ProfileManagerProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const refresh = useCallback(() => {
    const next = getProfiles();
    const active = getActiveProfile();
    setProfiles(next);
    setActiveId(active?.id ?? null);
    onChange?.(active);
  }, [onChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleAdd() {
    if (profiles.length >= PROFILE_LIMITS.maxProfiles) {
      setErrorMessage(ERROR_MESSAGES["limit-reached"]);
      return;
    }
    setErrorMessage(null);
    const suggested = profiles.length === 0 ? "メイン" : "";
    setEditor({ mode: "create", suggestedName: suggested });
  }

  function handleEditDistrict(profile: Profile) {
    setErrorMessage(null);
    setEditor({ mode: "edit-district", profile });
  }

  function handleRename(profile: Profile) {
    setErrorMessage(null);
    setRenameTarget(profile);
    setRenameDraft(profile.name);
  }

  function handleDelete(profile: Profile) {
    if (!window.confirm(`プロファイル "${profile.name}" を削除しますか?`)) {
      return;
    }
    const r = deleteProfile(profile.id);
    if (!r.ok) setErrorMessage(ERROR_MESSAGES[r.error]);
    refresh();
  }

  function handleSetActive(profile: Profile) {
    const r = setActiveProfile(profile.id);
    if (!r.ok) setErrorMessage(ERROR_MESSAGES[r.error]);
    refresh();
  }

  function handleDistrictPicked(districtId: string) {
    if (editor?.mode === "create") {
      // For creation we ask the name in a follow-up prompt rather than a
      // second modal. Plain prompt() avoids growing a nested-modal pattern
      // for what is at most a 5-row managed list.
      const defaultName = editor.suggestedName || "新規プロファイル";
      const raw = window.prompt("プロファイル名を入力", defaultName);
      if (raw === null) return;
      const r = createProfile({ name: raw, districtId });
      if (!r.ok) {
        setErrorMessage(ERROR_MESSAGES[r.error]);
        return;
      }
      setErrorMessage(null);
      refresh();
      return;
    }
    if (editor?.mode === "edit-district") {
      const r = setProfileDistrict(editor.profile.id, districtId);
      if (!r.ok) setErrorMessage(ERROR_MESSAGES[r.error]);
      refresh();
    }
  }

  function commitRename() {
    if (renameTarget == null) return;
    const r = renameProfile(renameTarget.id, renameDraft);
    if (!r.ok) {
      setErrorMessage(ERROR_MESSAGES[r.error]);
      return;
    }
    setErrorMessage(null);
    setRenameTarget(null);
    refresh();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          ごみ収集地区プロファイル
        </h2>
        <p className="text-sm text-gray-600 mt-0.5">
          家・職場・実家など最大 {PROFILE_LIMITS.maxProfiles}{" "}
          件まで登録できます。「現在のプロファイル」がゴミ収集や通知の対象になります。
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
          プロファイルが未登録です。
          <button
            type="button"
            onClick={handleAdd}
            className="ml-2 text-blue-600 underline hover:text-blue-800"
          >
            最初のプロファイルを追加する
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
          {profiles.map((p) => {
            const districtLabel =
              DISTRICT_LABEL_BY_ID.get(p.districtId) ?? p.districtId;
            const isActive = p.id === activeId;
            return (
              <li key={p.id} className="p-3 flex items-start gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input
                    type="radio"
                    name="active-profile"
                    checked={isActive}
                    onChange={() => handleSetActive(p)}
                    aria-label={`${p.name} を現在のプロファイルにする`}
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="font-semibold text-gray-900 truncate">
                      {p.name}
                      {isActive && (
                        <span className="ml-2 text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          現在
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      {districtLabel}
                    </span>
                  </span>
                </label>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRename(p)}
                    className="text-xs px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    名前
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditDistrict(p)}
                    className="text-xs px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    地区
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="text-xs px-2 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {profiles.length > 0 && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={profiles.length >= PROFILE_LIMITS.maxProfiles}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          + プロファイルを追加
        </button>
      )}

      {errorMessage && (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      {renameTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3
              id="rename-title"
              className="text-lg font-semibold text-gray-900"
            >
              名前を変更
            </h3>
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              maxLength={PROFILE_LIMITS.maxNameLength}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="プロファイル名"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(null);
                  setErrorMessage(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={commitRename}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <DistrictSelector
        open={editor != null}
        onClose={() => setEditor(null)}
        onSelect={handleDistrictPicked}
        initialDistrictId={
          editor?.mode === "edit-district" ? editor.profile.districtId : null
        }
        confirmLabel={
          editor?.mode === "edit-district" ? "地区を更新" : "プロファイルを作成"
        }
      />
    </section>
  );
}
