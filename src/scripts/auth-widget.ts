import {
  AUTH_EVENT,
  clearSession,
  getSession,
  hasDeviceFlow,
  loginWithToken,
  pollDeviceToken,
  requestDeviceCode,
  type AuthSession,
} from './auth';
import { getClientT } from './client-i18n';
import { $, setBusy } from './utils';

const root = $<HTMLElement>('[data-auth-widget]');
if (root) init(root);

function init(widget: HTMLElement): void {
  const dialog = document.getElementById('auth-dialog') as HTMLDialogElement | null;
  const openButton = $<HTMLButtonElement>('.js-auth-open', widget);
  const userTrigger = $<HTMLButtonElement>('.js-user-trigger', widget);
  const dropdown = $<HTMLElement>('.js-user-dropdown', widget);
  const loginLabel = $<HTMLElement>('.js-login-label', widget);
  const avatar = $<HTMLImageElement>('.js-user-avatar', widget);
  const avatarFallback = $<HTMLElement>('.js-user-fallback', widget);
  const userName = $<HTMLElement>('.js-user-name', widget);
  const userLogin = $<HTMLElement>('.js-user-login', widget);
  const userRole = $<HTMLElement>('.js-user-role', widget);
  const adminLink = $<HTMLAnchorElement>('.js-admin-link', widget);
  const profileLink = $<HTMLAnchorElement>('.js-profile-link', widget);
  const logoutButton = $<HTMLButtonElement>('.js-logout', widget);

  avatar?.addEventListener('error', () => {
    if (avatar) avatar.hidden = true;
    if (avatarFallback) {
      avatarFallback.hidden = false;
      avatarFallback.textContent = (userLogin?.textContent || '?').replace(/^@/, '').slice(0, 1).toUpperCase();
    }
  });

  const deviceStart = $<HTMLButtonElement>('.js-device-start', dialog ?? document);
  const devicePanel = $<HTMLElement>('[data-device-panel]', dialog ?? document);
  const deviceCode = $<HTMLElement>('.js-device-code', dialog ?? document);
  const deviceLink = $<HTMLAnchorElement>('.js-device-link', dialog ?? document);
  const deviceStatus = $<HTMLElement>('.js-device-status', dialog ?? document);
  const tokenForm = $<HTMLFormElement>('.js-token-form', dialog ?? document);
  const tokenInput = $<HTMLInputElement>('.js-token-input', dialog ?? document);
  const tokenButton = $<HTMLButtonElement>('.js-token-submit', dialog ?? document);
  const authError = $<HTMLElement>('.js-auth-error', dialog ?? document);
  const signedInPanel = $<HTMLElement>('[data-signed-in]', dialog ?? document);
  const signedInText = $<HTMLElement>('.js-signed-in-text', dialog ?? document);
  const dialogLogout = $<HTMLButtonElement>('.js-dialog-logout', dialog ?? document);

  let deviceAbort: AbortController | undefined;
  const isZh = window.MW?.config.lang === 'zh';

  function sync(session: AuthSession | null): void {
    if (session) {
      if (openButton) openButton.hidden = true;
      if (userTrigger) userTrigger.hidden = false;
      if (loginLabel) loginLabel.textContent = session.login;
      if (userName) userName.textContent = session.name;
      if (userLogin) userLogin.textContent = `@${session.login}`;
      if (userRole) {
        userRole.textContent = session.canModerate
          ? isZh
            ? '维护者'
            : 'Maintainer'
          : isZh
            ? '贡献者'
            : 'Contributor';
      }
      if (adminLink) adminLink.hidden = !session.canModerate;
      if (profileLink) profileLink.href = `https://github.com/${session.login}`;
      if (avatar) {
        avatar.src = session.avatarUrl;
        avatar.alt = `@${session.login}`;
        avatar.hidden = false;
      }
      if (avatarFallback) {
        avatarFallback.textContent = session.login.slice(0, 1).toUpperCase();
        avatarFallback.hidden = true;
      }
      if (signedInPanel) signedInPanel.hidden = false;
      if (signedInText) signedInText.textContent = `@${session.login}`;
    } else {
      if (openButton) openButton.hidden = false;
      if (userTrigger) userTrigger.hidden = true;
      if (dropdown) dropdown.hidden = true;
      if (signedInPanel) signedInPanel.hidden = true;
      if (devicePanel) devicePanel.hidden = true;
      if (tokenButton) tokenButton.disabled = false;
    }
  }

  async function openDialog(): Promise<void> {
    if (!dialog) return;
    const t = await getClientT();
    const session = getSession();
    sync(session);
    if (authError) authError.hidden = true;
    if (!session) {
      const intro = $<HTMLElement>('.js-auth-intro', dialog);
      if (intro) intro.textContent = t('auth.dialogIntro');
      if (signedInPanel) signedInPanel.hidden = true;
    }
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(): void {
    deviceAbort?.abort();
    deviceAbort = undefined;
    dialog?.close();
  }

  // Any page-level "sign in" trigger (editor, admin) opens the same dialog.
  document.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest('.js-auth-open');
    if (target) void openDialog();
  });
  userTrigger?.addEventListener('click', () => {
    if (!dropdown) return;
    dropdown.hidden = !dropdown.hidden;
    userTrigger.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  document.addEventListener('click', (event) => {
    if (!dropdown || dropdown.hidden) return;
    const target = event.target as Node;
    if (!widget.contains(target)) dropdown.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dropdown && !dropdown.hidden) dropdown.hidden = true;
  });

  logoutButton?.addEventListener('click', () => {
    clearSession();
    sync(null);
    if (dropdown) dropdown.hidden = true;
  });
  dialogLogout?.addEventListener('click', () => {
    clearSession();
    sync(null);
    closeDialog();
  });

  $<HTMLButtonElement>('.js-dialog-close', dialog ?? document)?.addEventListener('click', closeDialog);
  dialog?.addEventListener('close', () => {
    deviceAbort?.abort();
    deviceAbort = undefined;
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  deviceStart?.addEventListener('click', async () => {
    if (!deviceStart || !devicePanel || !deviceCode || !deviceLink) return;
    const t = await getClientT();
    if (!hasDeviceFlow()) {
      if (authError) {
        authError.textContent = t('auth.deviceNotConfigured');
        authError.hidden = false;
      }
      return;
    }
    if (authError) authError.hidden = true;
    setBusy(deviceStart, true, t('auth.starting'));
    try {
      const code = await requestDeviceCode();
      deviceCode.textContent = code.user_code;
      deviceLink.href = code.verification_uri;
      deviceLink.textContent = code.verification_uri;
      devicePanel.hidden = false;
      if (deviceStatus) deviceStatus.textContent = t('auth.devicePending');
      deviceAbort?.abort();
      deviceAbort = new AbortController();
      const token = await pollDeviceToken(code.device_code, code.interval, {
        signal: deviceAbort.signal,
        onTick: (elapsed) => {
          if (deviceStatus) {
            deviceStatus.textContent = `${t('auth.waiting')} ${elapsed}s`;
          }
        },
      });
      await loginWithToken(token);
      sync(getSession());
      closeDialog();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        if (authError) {
          authError.textContent = t('auth.deviceError');
          authError.hidden = false;
        }
      }
    } finally {
      setBusy(deviceStart, false);
    }
  });

  tokenForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!tokenInput || !tokenButton) return;
    const t = await getClientT();
    if (authError) authError.hidden = true;
    setBusy(tokenButton, true, t('auth.signingIn'));
    try {
      await loginWithToken(tokenInput.value);
      tokenInput.value = '';
      sync(getSession());
      closeDialog();
    } catch (error) {
      if (authError) {
        const status = (error as { status?: number }).status;
        authError.textContent = status === 403 || status === 429 ? t('auth.rateLimited') : t('auth.failed');
        authError.hidden = false;
      }
    } finally {
      setBusy(tokenButton, false);
    }
  });

  window.addEventListener(AUTH_EVENT, (event) => {
    const detail = (event as CustomEvent<AuthSession | null>).detail;
    sync(detail ?? getSession());
  });

  sync(getSession());
}
