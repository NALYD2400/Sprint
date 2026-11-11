param(
    [int]$RootProcessId = 0,
    [ValidateRange(2, 60)][int]$Seconds = 12
)

$ErrorActionPreference = 'Stop'
$allProcesses = Get-CimInstance Win32_Process
if (!$RootProcessId) {
    $candidates = @($allProcesses | Where-Object { $_.Name -eq 'sprint.exe' })
    if ($candidates.Count -ne 1) { throw 'Specify -RootProcessId to select the Sprint instance.' }
    $RootProcessId = $candidates[0].ProcessId
}
$rootProcess = $allProcesses | Where-Object { $_.ProcessId -eq $RootProcessId -and $_.Name -eq 'sprint.exe' }
if (!$rootProcess) { throw 'The selected process is not a running Sprint instance.' }
$processIds = [System.Collections.Generic.HashSet[int]]::new()
[void]$processIds.Add($RootProcessId)
do {
    $added = $false
    foreach ($process in $allProcesses) {
        if ($processIds.Contains([int]$process.ParentProcessId) -and $processIds.Add([int]$process.ProcessId)) {
            $added = $true
        }
    }
} while ($added)
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$initialCpu = @{}
foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) { $initialCpu[$processId] = $process.CPU }
}
$clock = [System.Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Seconds $Seconds
$cpuSeconds = 0.0
$privateCommit = 0L
foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        if ($initialCpu.ContainsKey($processId)) { $cpuSeconds += $process.CPU - $initialCpu[$processId] }
        $privateCommit += $process.PrivateMemorySize64
    }
}
$elapsed = $clock.Elapsed.TotalSeconds
$resident = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $processIds.Contains([int]$_.IDProcess) }
[pscustomobject]@{
    SampleSeconds = [math]::Round($elapsed, 2)
    LogicalProcessors = $cores
    CpuSystemPercent = [math]::Round($cpuSeconds / $elapsed / $cores * 100, 2)
    PrivateResidentMiB = [math]::Round(($resident | Measure-Object WorkingSetPrivate -Sum).Sum / 1MB, 1)
    PrivateCommitMiB = [math]::Round($privateCommit / 1MB, 1)
    ProcessCount = @($resident).Count
    RootProcessId = $RootProcessId
    Executable = $rootProcess.ExecutablePath
} | ConvertTo-Json
