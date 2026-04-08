param(
	[Parameter(Mandatory = $true, Position = 0)]
	[string]$Tool,

	[Parameter(ValueFromRemainingArguments = $true, Position = 1)]
	[string[]]$Args
)

$resolved = $null

try {
	$resolved = (Get-Command $Tool -ErrorAction Stop | Select-Object -First 1 -ExpandProperty Source)
} catch {
}

if (-not $resolved) {
	$candidates = switch ($Tool.ToLowerInvariant()) {
		'node' {
			@(
				"$env:ProgramFiles\Volta\node.exe",
				"$env:LOCALAPPDATA\Volta\bin\node.exe",
				"$env:ProgramFiles\nodejs\node.exe"
			)
		}
		'npm' {
			@(
				"$env:ProgramFiles\Volta\npm.cmd",
				"$env:ProgramFiles\Volta\npm.exe",
				"$env:LOCALAPPDATA\Volta\bin\npm.cmd",
				"$env:LOCALAPPDATA\Volta\bin\npm.exe",
				"$env:ProgramFiles\nodejs\npm.cmd",
				"$env:ProgramFiles\nodejs\npm.exe"
			)
		}
		'npx' {
			@(
				"$env:ProgramFiles\Volta\npx.cmd",
				"$env:ProgramFiles\Volta\npx.exe",
				"$env:LOCALAPPDATA\Volta\bin\npx.cmd",
				"$env:LOCALAPPDATA\Volta\bin\npx.exe",
				"$env:ProgramFiles\nodejs\npx.cmd",
				"$env:ProgramFiles\nodejs\npx.exe"
			)
		}
		default {
			@()
		}
	}

	$resolved = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

if (-not $resolved) {
	Write-Error "Unable to locate '$Tool'. Install Node.js or add it to your PATH."
	exit 1
}

& $resolved @Args
exit $LASTEXITCODE
