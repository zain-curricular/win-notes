import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Alert, Linking } from 'react-native'
import { findApkUpdate } from './release'

const DISMISSED_KEY = 'win-notes:dismissed-update'

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return res.json()
}

/**
 * The APK opens in the browser to download; Android installs it over this app only when it is signed with the same
 * key, which is what keeps the notes and stops anyone else's build from replacing this one.
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  const current = Constants.expoConfig?.version ?? '0.0.0'
  try {
    const update = await findApkUpdate(current, fetchJson)
    if (!update) {
      if (manual) Alert.alert('Notes is up to date', `This is version ${current}.`)
      return
    }
    if (!manual && (await AsyncStorage.getItem(DISMISSED_KEY)) === update.version) return
    Alert.alert(`Notes ${update.version} is available`, 'Open the download when it finishes and Android installs it over this version, keeping your notes.', [
      { text: 'Later', style: 'cancel', onPress: () => void AsyncStorage.setItem(DISMISSED_KEY, update.version) },
      { text: 'Download', onPress: () => void Linking.openURL(update.url) }
    ])
  } catch (err) {
    if (manual) Alert.alert("Couldn't check for updates", err instanceof Error ? err.message : String(err))
  }
}
