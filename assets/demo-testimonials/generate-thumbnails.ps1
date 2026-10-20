$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $root
try {
    foreach ($item in @(@{ Id = '01'; Extension = 'mp4' }, @{ Id = '02'; Extension = 'webm' })) {
        $source = "assets/demo-testimonials/hiru-demo-$($item.Id).$($item.Extension)"
        $target = "assets/demo-testimonials/hiru-demo-$($item.Id)-thumbnail.png"
        if (!(Test-Path $source)) { throw "Missing demo video: $source" }
        if (Test-Path $target) { throw "Thumbnail exists; review before replacing: $target" }
        ffmpeg -v error -n -ss 1 -i $source -frames:v 1 -vf "drawbox=x=0:y=0:w=iw:h=85:color=0x202733@1:t=fill,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':textfile='assets/demo-testimonials/thumbnail-label.txt':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=23" $target
        if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed for $source" }
    }
} finally { Pop-Location }
