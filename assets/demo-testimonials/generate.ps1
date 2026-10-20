$ErrorActionPreference = 'Stop'
Set-Content -Path "$PSScriptRoot/title.txt" -Value ('Demo Video Testimoni ' + [char]0x2014 + ' Preview') -Encoding utf8
Set-Content -Path "$PSScriptRoot/label.txt" -Value 'Demo / Preview untuk Evaluasi Client' -Encoding utf8
Push-Location $PSScriptRoot
try {
    foreach ($number in @('01', '02')) {
        $color = if ($number -eq '01') { '0x132B56' } else { '0x954900' }
        $extension = if ($number -eq '01') { 'mp4' } else { 'webm' }
        $codec = if ($number -eq '01') { 'libx264' } else { 'libvpx-vp9' }
        $filter = "drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='HIRU ACADEMY':fontcolor=white:fontsize=48:x=(w-tw)/2:y=110,drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':textfile=title.txt:fontcolor=white:fontsize=34:x=(w-tw)/2:y=230,drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':textfile=label.txt:fontcolor=white:fontsize=28:x=(w-tw)/2:y=310,drawtext=fontfile='C\:/Windows/Fonts/arial.ttf':text='BUKAN SISWA - BUKAN TESTIMONI NYATA':fontcolor=white:fontsize=24:x=(w-tw)/2:y=390"
        & ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=${color}:s=960x540:r=24:d=5" -vf $filter -c:v $codec -pix_fmt yuv420p "hiru-demo-$number.$extension"
        if ($LASTEXITCODE -ne 0) { throw 'FFmpeg failed.' }
    }
} finally { Pop-Location }
