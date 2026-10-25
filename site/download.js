// The links in index.html already point at the latest release page; this upgrades them to the files themselves and
// lists every published version. Release text comes from the GitHub API, so it is only ever set as textContent.
const REPO = 'zain-curricular/win-notes'
const names = { win: 'Windows', mac: 'Mac', linux: 'Linux', android: 'Android', ios: 'iPhone' }
// One file per platform for the big button; Linux offers the .deb, which also handles sign-in links.
const primaryAsset = { win: '.exe', mac: '.dmg', linux: '.deb', android: '.apk' }
const columns = [
  ['Windows', '.exe'],
  ['Mac', '.dmg'],
  ['Linux .deb', '.deb'],
  ['Linux AppImage', '.AppImage'],
  ['Android', '.apk'],
  ['SHA256SUMS', 'SHA256SUMS']
]

const ua = navigator.userAgent
const visitor = /Android/i.test(ua)
  ? 'android'
  : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    ? 'ios'
    : /Mac/i.test(ua)
      ? 'mac'
      : /Windows/i.test(ua)
        ? 'win'
        : /Linux|X11/i.test(ua)
          ? 'linux'
          : null

const size = (bytes) => `${Math.max(1, Math.round(bytes / 1e6))} MB`
const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const findAsset = (release, suffix) => release.assets.find((a) => a.name.endsWith(suffix))

function link(href, text) {
  const a = document.createElement('a')
  a.href = href
  a.textContent = text
  return a
}

function showLatest(release) {
  document.getElementById('version').textContent = `Version ${release.tag_name.replace(/^v/, '')} · ${date(release.published_at)}`
  for (const el of document.querySelectorAll('[data-asset]')) {
    const asset = findAsset(release, el.dataset.asset)
    if (!asset) continue
    el.href = asset.browser_download_url
    el.textContent += ` · ${size(asset.size)}`
  }
  const primary = document.getElementById('primary')
  if (visitor === 'ios') {
    primary.textContent = 'Not available for iPhone yet'
    primary.removeAttribute('href')
    return
  }
  const asset = visitor && findAsset(release, primaryAsset[visitor])
  if (!asset) return
  primary.href = asset.browser_download_url
  primary.textContent = `Download for ${names[visitor]}`
}

function showVersions(releases) {
  const body = document.getElementById('versions')
  body.replaceChildren()
  for (const release of releases) {
    const row = body.insertRow()
    row.insertCell().append(link(release.html_url, release.tag_name.replace(/^v/, '')))
    row.insertCell().textContent = date(release.published_at)
    const files = row.insertCell()
    for (const [label, suffix] of columns) {
      const asset = findAsset(release, suffix)
      if (asset) files.append(link(asset.browser_download_url, label), ' ')
    }
  }
}

// Drafts and pre-releases are left out: a draft is still being checked, and the API only lists drafts to the owner.
fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`)
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((all) => {
    const releases = all.filter((r) => !r.draft && !r.prerelease)
    if (!releases.length) return
    showLatest(releases[0])
    showVersions(releases)
  })
  .catch(() => {})
