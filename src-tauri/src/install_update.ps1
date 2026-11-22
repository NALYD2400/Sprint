$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$installer = $env:SPRINT_INSTALLER
$sprintExe = $env:SPRINT_EXE
$validateOnly = $env:SPRINT_UPDATE_VALIDATE_ONLY -eq '1'

try {
    if (!$validateOnly) {
        $parent = Get-Process -Id ([int]$env:SPRINT_UPDATE_PARENT) -ErrorAction SilentlyContinue
        if ($parent) {
            Wait-Process -InputObject $parent -Timeout 30 -ErrorAction Stop
        }
    }

    # Deny writes and deletion from verification through process creation.
    $file = [IO.File]::Open($installer, 'Open', 'Read', 'Read')
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            $hash = [BitConverter]::ToString($sha256.ComputeHash($file)).Replace('-', '')
        } finally {
            $sha256.Dispose()
        }
        if ($hash -ne $env:SPRINT_INSTALLER_SHA256) {
            throw 'Le fichier installateur a changé depuis son téléchargement.'
        }

        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ($signature.Status -eq 'NotSigned') {
            $installedSignature = Get-AuthenticodeSignature -LiteralPath $sprintExe
            if ($installedSignature.Status -ne 'NotSigned') {
                throw 'Cette installation de Sprint exige une mise à jour signée.'
            }
        } elseif ($signature.Status -ne 'Valid') {
            throw "La signature Windows de l'installateur est invalide ($($signature.Status))."
        }

        if (!$validateOnly) {
            $setup = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
        }
    } finally {
        $file.Dispose()
    }

    if (!$validateOnly) {
        $setup.WaitForExit()
        if ($setup.ExitCode -ne 0) {
            throw "L'installateur a échoué (code $($setup.ExitCode))."
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    if (!$validateOnly) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Mise à jour de Sprint')
    }
    exit 1
} finally {
    if (!$validateOnly) {
        Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
        try { [IO.Directory]::Delete([IO.Path]::GetDirectoryName($installer)) } catch {}
        if ([IO.File]::Exists($sprintExe)) {
            Start-Process -FilePath $sprintExe
        }
    }
}
