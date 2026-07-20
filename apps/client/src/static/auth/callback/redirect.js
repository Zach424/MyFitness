;(() => {
  const query = window.location.search
  const callbackTarget = `${window.location.origin}${window.location.pathname}`
  try {
    window.sessionStorage.setItem('myfitness.auth.oidc.callbackTarget', callbackTarget)
    window.history.replaceState(null, '', window.location.pathname)
  } finally {
    window.location.replace(`/#/pages/login/index${query}`)
  }
})()
