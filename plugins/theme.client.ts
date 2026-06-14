export default defineNuxtPlugin(() => {
  const theme = useTheme()

  watchEffect(() => {
    const colorMode = theme.isDark.value ? 'app-theme-dark' : 'app-theme-light'

    document.documentElement.classList.remove('app-theme-dark', 'app-theme-light')
    document.documentElement.classList.add(colorMode)
  })
})
