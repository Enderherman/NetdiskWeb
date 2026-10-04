<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { accountApi } from '../api/account'
import { errorMessage, useAccount } from '../composables/account'
import { safeReturnPath } from '../router/guards'
import AppIcon from '../components/AppIcon.vue'
import CaptchaInput from '../components/CaptchaInput.vue'
import ThemeSwitcher from '../components/ThemeSwitcher.vue'
import { version } from '../../package.json'

const route = useRoute()
const router = useRouter()
const account = useAccount()
const mode = computed(() => route.path.endsWith('/register') ? 'register' : route.path.endsWith('/reset') ? 'reset' : 'login')
const title = computed(() => mode.value === 'register' ? '开启你的云端空间' : mode.value === 'reset' ? '找回你的账号' : '欢迎回来')
const fields = reactive({ email: '', nickName: '', password: '', confirmPassword: '', checkCode: '', emailCode: '' })
const busy = ref(false)
const sending = ref(false)
const error = ref('')
const notice = ref('')
const emailChallenge = ref(false)
const emailCheckCode = ref('')
const sendError = ref('')
const cooldown = ref(0)
const emailEnabled = ref<boolean | null>(null)
const capabilityError = ref('')
const captcha = ref<InstanceType<typeof CaptchaInput>>()
const emailCaptcha = ref<InstanceType<typeof CaptchaInput>>()
let cooldownTimer: ReturnType<typeof setInterval> | undefined

watch(mode, () => {
  Object.assign(fields, { password: '', confirmPassword: '', checkCode: '', emailCode: '' })
  error.value = ''; notice.value = ''; emailChallenge.value = false; sendError.value = ''
})
onBeforeUnmount(() => clearInterval(cooldownTimer))
onMounted(async () => {
  try { emailEnabled.value = (await accountApi.capabilities()).emailVerificationEnabled }
  catch (reason) { capabilityError.value = errorMessage(reason) }
})

function validEmail() {
  return /^[\w-]+(\.[\w-]+)*@[\w-]+(\.[\w-]+)+$/.test(fields.email.trim()) && fields.email.trim().length <= 150
}
function startEmailChallenge() {
  error.value = ''
  if (emailEnabled.value === false) { error.value = '邮箱验证暂不可用，请联系管理员'; return }
  if (!validEmail()) { error.value = '请先填写有效的邮箱地址'; return }
  emailChallenge.value = true
  emailCheckCode.value = ''
  sendError.value = ''
}
async function sendEmailCode() {
  if (sending.value || cooldown.value > 0) return
  if (!validEmail()) { sendError.value = '请填写有效的邮箱地址'; return }
  if (!emailCheckCode.value.trim()) { sendError.value = '请输入图形验证码'; return }
  sending.value = true
  sendError.value = ''
  try {
    await accountApi.sendEmailCode(fields.email.trim(), emailCheckCode.value.trim(), mode.value === 'register' ? 0 : 1)
    notice.value = '邮箱验证码已发送，请查看收件箱或垃圾邮件。'
    emailChallenge.value = false
    cooldown.value = 60
    clearInterval(cooldownTimer)
    cooldownTimer = setInterval(() => { if (--cooldown.value <= 0) clearInterval(cooldownTimer) }, 1000)
  } catch (reason) { sendError.value = errorMessage(reason) }
  finally { sending.value = false; emailCaptcha.value?.refresh() }
}
async function submit() {
  if (busy.value || sending.value) return
  error.value = ''
  notice.value = ''
  if (!validEmail()) { error.value = '请输入有效的邮箱地址'; return }
  if (!fields.password) { error.value = '请输入密码'; return }
  if (mode.value !== 'login') {
    if (emailEnabled.value === false) { error.value = '邮箱验证暂不可用，请联系管理员'; return }
    if (!/^(?=.*\d)(?=.*[a-zA-Z]).{8,64}$/.test(fields.password)) { error.value = '密码需为 8–64 位，至少包含字母和数字'; return }
    if (fields.password !== fields.confirmPassword) { error.value = '两次输入的密码不一致'; return }
    if (mode.value === 'register' && !fields.nickName.trim()) { error.value = '请输入昵称'; return }
    if (!fields.emailCode.trim()) { error.value = '请输入邮箱验证码'; return }
  }
  if (!fields.checkCode.trim()) { error.value = '请输入图形验证码'; return }
  busy.value = true
  const common = { email: fields.email.trim(), password: fields.password, checkCode: fields.checkCode.trim() }
  try {
    if (mode.value === 'login') {
      await account.login(common)
      fields.password = ''
      fields.checkCode = ''
      await router.replace(safeReturnPath(route.query.redirect))
    } else {
      if (mode.value === 'register') await accountApi.register({ ...common, nickName: fields.nickName.trim(), emailCode: fields.emailCode.trim() })
      else await accountApi.resetPassword({ ...common, emailCode: fields.emailCode.trim() })
      const completed = mode.value
      await router.replace({ path: '/auth/login', query: { completed } })
    }
  } catch (reason) { error.value = errorMessage(reason) }
  finally { busy.value = false; captcha.value?.refresh() }
}
</script>

<template>
  <div class="auth-page">
    <header class="auth-header"><RouterLink class="brand" to="/auth/login"><span class="brand-mark"><AppIcon name="folder" :size="22" /></span><span>Netdisk<span class="brand-dot">.</span></span></RouterLink><ThemeSwitcher /></header>
    <main class="auth-main">
      <aside class="auth-story" aria-label="Netdisk 介绍"><p class="eyebrow">A SPACE THAT FEELS LIKE YOU</p><h1>重要的，<br />都在这里<span class="heading-period">.</span></h1><p>给文件一个归处，<br />给生活多一点从容。</p><div class="auth-art" aria-hidden="true"><div class="auth-art-orbit" /><div class="auth-art-sheet"><AppIcon name="files" :size="45" /><i /><i /></div><div class="auth-art-folder"><AppIcon name="folder" :size="80" /></div><span>YOUR PERSONAL CLOUD</span></div><div class="auth-story-footer"><span class="quiet-dot" />属于你的空间，自在有序。</div></aside>
      <section class="auth-card" :aria-labelledby="'auth-title'">
        <p class="eyebrow">{{ mode === 'login' ? 'GOOD TO SEE YOU AGAIN' : mode === 'register' ? 'START SOMETHING GOOD' : 'LET’S GET YOU BACK' }}</p><h2 id="auth-title">{{ title }}<span class="heading-period">.</span></h2><p class="auth-description">{{ mode === 'register' ? '用邮箱创建账号，开始你的全新空间。' : mode === 'reset' ? '通过邮箱验证，设置一个新的密码。' : '登录 Netdisk，回到属于你的空间。' }}</p>
        <p v-if="route.query.expired" class="form-notice" role="status">登录已过期，请重新登录。</p>
        <p v-if="mode === 'login' && route.query.completed === 'register'" class="form-notice success" role="status">账号创建成功，现在可以登录了。</p>
        <p v-if="mode === 'login' && route.query.completed === 'reset'" class="form-notice success" role="status">密码已更新，请使用新密码登录。</p>
        <p v-if="account.sessionError.value" class="form-notice" role="status">{{ account.sessionError.value }}</p>
        <p v-if="mode !== 'login' && emailEnabled === false" class="form-notice" role="status">邮箱验证暂未开放，当前无法注册或找回密码。请联系管理员。</p>
        <p v-if="mode !== 'login' && capabilityError" class="form-notice" role="status">{{ capabilityError }}</p>
        <form novalidate :aria-busy="busy" @submit.prevent="submit">
          <div class="form-field"><label for="email">邮箱地址</label><input id="email" v-model="fields.email" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com" maxlength="150" :disabled="busy || sending" required /></div>
          <template v-if="mode !== 'login'">
            <div class="form-field"><label for="email-code">邮箱验证码</label><div class="email-code-row"><input id="email-code" v-model="fields.emailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="输入收到的验证码" :disabled="busy" required /><button class="secondary-button" type="button" :disabled="busy || sending || cooldown > 0 || emailEnabled === false" :aria-expanded="emailChallenge" @click="startEmailChallenge">{{ cooldown > 0 ? `${cooldown} 秒后重发` : '获取验证码' }}</button></div></div>
            <div v-if="emailChallenge" class="email-challenge"><p>发送邮件前，请完成图形验证。</p><CaptchaInput id="email-captcha" ref="emailCaptcha" v-model="emailCheckCode" :type="1" :disabled="sending" /><p v-if="sendError" class="field-error" role="alert">{{ sendError }}</p><button class="secondary-button" type="button" :disabled="sending" @click="sendEmailCode">{{ sending ? '正在发送…' : '发送邮箱验证码' }}</button></div>
            <div v-if="mode === 'register'" class="form-field"><label for="nickname">昵称</label><input id="nickname" v-model="fields.nickName" autocomplete="nickname" maxlength="20" placeholder="如何称呼你" :disabled="busy" required /></div>
          </template>
          <div class="form-field"><div class="label-row"><label for="password">{{ mode === 'reset' ? '新密码' : '密码' }}</label><RouterLink v-if="mode === 'login'" to="/auth/reset">忘记密码？</RouterLink></div><input id="password" v-model="fields.password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :maxlength="mode === 'login' ? 128 : 64" :placeholder="mode === 'login' ? '输入你的密码' : '8–64 位，包含字母和数字'" :disabled="busy" required /><p v-if="mode !== 'login'" class="field-hint">至少包含字母和数字，也可以使用特殊字符。</p></div>
          <div v-if="mode !== 'login'" class="form-field"><label for="confirm-password">确认密码</label><input id="confirm-password" v-model="fields.confirmPassword" type="password" autocomplete="new-password" maxlength="64" placeholder="再次输入密码" :disabled="busy" required /></div>
          <CaptchaInput :key="mode" id="check-code" ref="captcha" v-model="fields.checkCode" :disabled="busy" />
          <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
          <button class="primary-button auth-submit" type="submit" :disabled="busy || sending || (mode !== 'login' && emailEnabled === false)"><span v-if="busy" class="loading-dot" />{{ busy ? '正在处理…' : mode === 'register' ? '创建账号' : mode === 'reset' ? '更新密码' : '登录' }}<AppIcon v-if="!busy" name="arrow" :size="17" /></button>
        </form>
        <p class="auth-switch" v-if="mode === 'login'">还没有账号？<RouterLink to="/auth/register">创建账号<AppIcon name="arrow" :size="14" /></RouterLink></p><p class="auth-switch" v-else>已有账号？<RouterLink to="/auth/login">返回登录<AppIcon name="arrow" :size="14" /></RouterLink></p>
      </section>
    </main>
    <footer class="auth-footer"><span>简单一点，空间多一点。</span><span>Netdisk · v{{ version }}</span></footer>
  </div>
</template>
