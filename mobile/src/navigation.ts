import type { NativeStackScreenProps } from '@react-navigation/native-stack'

export type RootStackParamList = {
  Folders: undefined
  Notes: undefined
  Editor: undefined
}

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>
