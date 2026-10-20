!define STARTUP_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define STARTUP_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
!define STARTUP_VALUE_NAME "electrontoolbox"

!ifndef BUILD_UNINSTALLER
  !include "MUI2.nsh"
  !include "nsDialogs.nsh"
  Var optionsDialog
  Var startupCheckbox
  Var desktopCheckbox
  Var menuCheckbox
  Var startupSelected
  Var desktopSelected
  Var menuSelected

  !macro customInit
    StrCpy $startupSelected ${BST_CHECKED}
    StrCpy $desktopSelected ${BST_CHECKED}
    StrCpy $menuSelected ${BST_CHECKED}
  !macroend

  !macro customPageAfterChangeDir
    Page custom InstallOptionsCreate InstallOptionsLeave
  !macroend

  Function InstallOptionsCreate
    !insertmacro MUI_HEADER_TEXT "安装选项" "选择安装拾用时需要启用的功能。"
    nsDialogs::Create 1018
    Pop $optionsDialog
    ${If} $optionsDialog == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "以下选项默认勾选，您可以按需取消。"
    Pop $0
    ${NSD_CreateCheckbox} 0 24u 100% 16u "开机自动启动"
    Pop $startupCheckbox
    ${NSD_SetState} $startupCheckbox $startupSelected
    ${NSD_CreateCheckbox} 0 44u 100% 16u "创建桌面快捷方式"
    Pop $desktopCheckbox
    ${NSD_SetState} $desktopCheckbox $desktopSelected
    ${NSD_CreateCheckbox} 0 64u 100% 16u "在开始菜单创建文件夹"
    Pop $menuCheckbox
    ${NSD_SetState} $menuCheckbox $menuSelected
    nsDialogs::Show
  FunctionEnd

  Function InstallOptionsLeave
    ${NSD_GetState} $startupCheckbox $startupSelected
    ${NSD_GetState} $desktopCheckbox $desktopSelected
    ${NSD_GetState} $menuCheckbox $menuSelected
  FunctionEnd
!endif

!macro customInstall
  ${If} $startupSelected == ${BST_CHECKED}
    WriteRegStr HKCU "${STARTUP_RUN_KEY}" "${STARTUP_VALUE_NAME}" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --autostart'
  ${Else}
    DeleteRegValue HKCU "${STARTUP_RUN_KEY}" "${STARTUP_VALUE_NAME}"
  ${EndIf}
  DeleteRegValue HKCU "${STARTUP_APPROVED_KEY}" "${STARTUP_VALUE_NAME}"

  ${If} $desktopSelected == ${BST_CHECKED}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $menuSelected == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\卸载拾用.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
  ${Else}
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
    Delete "$SMPROGRAMS\${MENU_FILENAME}\卸载拾用.lnk"
    RMDir "$SMPROGRAMS\${MENU_FILENAME}"
  ${EndIf}
  # The finish page must still launch the app if its menu link was removed.
  StrCpy $launchLink "$appExe"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "${STARTUP_RUN_KEY}" "${STARTUP_VALUE_NAME}"
  DeleteRegValue HKCU "${STARTUP_APPROVED_KEY}" "${STARTUP_VALUE_NAME}"
  Delete "$SMPROGRAMS\${MENU_FILENAME}\卸载拾用.lnk"
!macroend
