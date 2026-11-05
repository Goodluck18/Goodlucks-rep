import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, KeyRound, Lock, Mail, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar, SectionHeader, type DashboardRole } from './DashboardShell';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ROLE_LABEL: Record<DashboardRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  agent: 'Agent',
};

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

/**
 * Account settings: the profile picture and the password.
 *
 * Both forms are thin clients over the server endpoints (`POST /account/password`,
 * `POST|DELETE /account/avatar`). Validation is repeated here only to give fast
 * feedback — the server re-validates everything and verifies the current
 * password before changing anything.
 *
 * Contact details live on the Profile page; this page intentionally does not
 * duplicate that form.
 */
export const AccountSettingsView: React.FC<{ role: DashboardRole }> = ({ role }) => {
  const { currentUser, changePassword, uploadAvatar, removeAvatar } = useApp();

  // ---- profile picture -------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState<'upload' | 'remove' | null>(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const pickFile = (file: File | null) => {
    setAvatarError(null);
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('That image is larger than 2 MB. Please choose a smaller file.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
  };

  const clearSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setAvatarError('Choose an image first.');
      return;
    }
    setAvatarBusy('upload');
    setAvatarError(null);
    const result = await uploadAvatar(selectedFile);
    setAvatarBusy(null);
    if (!result.ok) {
      const fieldMessage = result.fields?.file || result.fields?.avatar;
      setAvatarError(fieldMessage || result.error || 'The picture could not be saved.');
      return;
    }
    clearSelection();
  };

  const handleRemove = async () => {
    setAvatarBusy('remove');
    setAvatarError(null);
    const result = await removeAvatar();
    setAvatarBusy(null);
    if (!result.ok) {
      setAvatarError(result.error || 'The picture could not be removed.');
    }
  };

  // ---- password --------------------------------------------------------
  const [form, setForm] = useState<Record<PasswordField, string>>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [show, setShow] = useState<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const updateField = (field: PasswordField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  const validate = (): boolean => {
    const next: Partial<Record<PasswordField, string>> = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password.';
    if (!form.newPassword) next.newPassword = 'Enter a new password.';
    else if (form.newPassword.length < 8) next.newPassword = 'Use at least 8 characters.';
    else if (form.newPassword === form.currentPassword)
      next.newPassword = 'Choose a password that is different from your current one.';
    if (!form.confirmPassword) next.confirmPassword = 'Confirm your new password.';
    else if (form.newPassword !== form.confirmPassword) next.confirmPassword = 'The two passwords do not match.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!validate()) return;

    setPasswordBusy(true);
    const result = await changePassword(form);
    setPasswordBusy(false);

    if (!result.ok) {
      const serverFields: Partial<Record<PasswordField, string>> = {};
      (['currentPassword', 'newPassword', 'confirmPassword'] as PasswordField[]).forEach((field) => {
        const value = result.fields?.[field];
        if (value) serverFields[field] = String(value);
      });
      setFieldErrors(serverFields);
      setPasswordError(result.error || 'Your password could not be changed.');
      return;
    }

    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordSuccess('Password changed. Other devices signed in to this account were signed out.');
  };

  const passwordFields: { key: PasswordField; label: string; autoComplete: string }[] = [
    { key: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
    { key: 'newPassword', label: 'New password', autoComplete: 'new-password' },
    { key: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Account settings"
        description="Your profile picture and your password. Contact details are edited on your Profile page."
      />

      {/* Profile picture */}
      <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ImagePlus className="w-4 h-4 text-[#08D9D6]" />
          <h2 className="text-sm font-bold text-white">Profile picture</h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar name={currentUser?.name} src={previewUrl || currentUser?.avatar} size="lg" />
          <div className="space-y-2 min-w-0">
            <p className="text-xs text-slate-400 leading-relaxed">
              JPG, PNG or WebP, up to 2 MB. Your picture appears next to your name across your account. If you do not
              upload one, your initials are shown — no stock portraits.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label="Choose a profile picture"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-200 hover:text-white hover:bg-white/10 transition-colors min-h-[40px]"
              >
                {currentUser?.avatar ? 'Choose a new picture' : 'Choose a picture'}
              </button>
              {selectedFile && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleUpload()}
                    disabled={avatarBusy === 'upload'}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#08D9D6] text-[#252A34] hover:bg-[#07c3c0] disabled:opacity-60 transition-colors min-h-[40px]"
                  >
                    {avatarBusy === 'upload' ? 'Saving…' : 'Save picture'}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white min-h-[40px]"
                  >
                    Cancel
                  </button>
                </>
              )}
              {currentUser?.avatar && !selectedFile && (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={avatarBusy === 'remove'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#FF8FA8] hover:bg-[#FF2E63]/10 disabled:opacity-60 transition-colors min-h-[40px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {avatarBusy === 'remove' ? 'Removing…' : 'Remove picture'}
                </button>
              )}
            </div>
          </div>
        </div>
        {avatarError && (
          <p role="alert" className="text-xs font-semibold text-[#FF8FA8] bg-[#FF2E63]/10 border border-[#FF2E63]/30 rounded-xl px-3 py-2">
            {avatarError}
          </p>
        )}
      </section>

      {/* Password */}
      <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#08D9D6]" />
            <h2 className="text-sm font-bold text-white">Password</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Changing your password signs out other devices. You will stay signed in here.
          </p>

          {passwordFields.map(({ key, label, autoComplete }) => (
            <div key={key}>
              <label htmlFor={`settings-${key}`} className="block text-[11px] font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                {label}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id={`settings-${key}`}
                  name={key}
                  type={show[key] ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  value={form[key]}
                  aria-invalid={fieldErrors[key] ? true : undefined}
                  onChange={(event) => updateField(key, event.target.value)}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#08D9D6]/60 focus:ring-2 focus:ring-[#08D9D6]/20"
                />
                <button
                  type="button"
                  onClick={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))}
                  aria-label={show[key] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors[key] && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors[key]}</p>}
            </div>
          ))}

          {passwordError && (
            <p role="alert" className="text-xs font-semibold text-[#FF8FA8] bg-[#FF2E63]/10 border border-[#FF2E63]/30 rounded-xl px-3 py-2">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p role="status" className="text-xs font-semibold text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 rounded-xl px-3 py-2">
              {passwordSuccess}
            </p>
          )}

          <button
            type="submit"
            disabled={passwordBusy}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold bg-[#08D9D6] text-[#252A34] hover:bg-[#07c3c0] disabled:opacity-60 transition-colors min-h-[44px]"
          >
            {passwordBusy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      {/* Read-only account facts */}
      <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
          <h2 className="text-sm font-bold text-white">Account</h2>
        </div>
        <dl className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-900/40 rounded-xl px-3 py-2.5">
            <dt className="text-slate-500 flex items-center gap-1.5">
              <UserRound className="w-3 h-3" /> Name
            </dt>
            <dd className="text-white font-semibold mt-0.5 break-words">{currentUser?.name || '—'}</dd>
          </div>
          <div className="bg-slate-900/40 rounded-xl px-3 py-2.5">
            <dt className="text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Email
            </dt>
            <dd className="text-white font-semibold mt-0.5 break-words">{currentUser?.email || '—'}</dd>
          </div>
          <div className="bg-slate-900/40 rounded-xl px-3 py-2.5">
            <dt className="text-slate-500">Account type</dt>
            <dd className="text-white font-semibold mt-0.5">{ROLE_LABEL[role]}</dd>
          </div>
          <div className="bg-slate-900/40 rounded-xl px-3 py-2.5">
            <dt className="text-slate-500">Email address changes</dt>
            <dd className="text-slate-300 mt-0.5 leading-relaxed">
              Contact Goodlucks Homes support to change the email on your account.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
};
