<?php

namespace App\Services;

use App\Models\TryOut;
use DateTimeInterface;
use RuntimeException;
use ZipArchive;

class TryOutReportWorkbook
{
    private function xml(string $value): string
    {
        $value = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $value) ?? '';

        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function column(int $index): string
    {
        $name = '';
        do {
            $name = chr(65 + $index % 26).$name;
            $index = intdiv($index, 26) - 1;
        } while ($index >= 0);

        return $name;
    }

    private function sheet($stream, iterable $rows): void
    {
        $write = static function (string $text) use ($stream): void {
            if (fwrite($stream, $text) !== strlen($text)) {
                throw new RuntimeException('Unable to write report worksheet.');
            }
        };
        $write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="64" width="24" customWidth="1"/></cols><sheetData>');
        $rowNumber = 0;
        $columns = 1;
        foreach ($rows as $row) {
            if (++$rowNumber > 1048576) {
                throw new RuntimeException('Excel row limit exceeded. Narrow report filters.');
            }
            $columns = max($columns, count($row));
            $write('<row r="'.$rowNumber.'">');
            foreach (array_values($row) as $index => $value) {
                $ref = $this->column($index).$rowNumber;
                $style = $rowNumber === 1 ? ' s="1"' : '';
                if ($value instanceof DateTimeInterface) {
                    $serial = ($value->getTimestamp() + $value->getOffset()) / 86400 + 25569;
                    $write('<c r="'.$ref.'" s="2"><v>'.$serial.'</v></c>');
                } elseif (is_int($value) || is_float($value)) {
                    $write('<c r="'.$ref.'"'.$style.'><v>'.$value.'</v></c>');
                } else {
                    if (is_array($value)) {
                        $value = json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
                    }
                    $value = is_bool($value) ? ($value ? 'Ya' : 'Tidak') : (string) ($value ?? '');
                    if (mb_strlen($value) > 32767) {
                        throw new RuntimeException('Excel cell text limit exceeded. Use individual JSON report for full snapshot.');
                    }
                    // Explicit inline strings keep formula-like text and phone numbers inert.
                    $write('<c r="'.$ref.'" t="inlineStr"'.$style.'><is><t xml:space="preserve">'.$this->xml($value).'</t></is></c>');
                }
            }
            $write('</row>');
        }
        $write('</sheetData><autoFilter ref="A1:'.$this->column($columns - 1).max(1, $rowNumber).'"/></worksheet>');
    }

    private function summaryRows(array $report): \Generator
    {
        yield ['Metrik', 'Nilai'];
        yield ['Try Out ID', $report['try_out']['id']];
        yield ['Try Out', $report['try_out']['title']];
        yield ['Level', $report['try_out']['level']];
        yield ['Zona waktu', 'Asia/Jakarta'];
        yield ['Cakupan', 'Attempt completed; periode berdasarkan waktu selesai'];
        yield ['Penilaian', 'Raw Score dan Final Score memakai earned tersimpan; tanpa pembulatan baru'];
        foreach ($report['filters'] as $key => $value) {
            yield [$key, $value];
        }
        foreach ($report['summary'] as $key => $value) {
            yield [$key, $value];
        }
        foreach ($report['histogram'] as $bin) {
            yield ['Skor '.$bin['label'], $bin['count']];
        }
    }

    private function participantRows(TryOut $tryOut, array $filters, AdminTryOutReportService $reports): \Generator
    {
        $headers = ['Attempt ID', 'User ID', 'Nama', 'WhatsApp', 'Mulai (Jakarta)', 'Selesai (Jakarta)', 'Status', 'Raw Score', 'Final Score', 'Maksimum', 'Lulus'];
        foreach (TryOutService::SESSIONS as $label) {
            array_push($headers, $label.' Skor', $label.' Maksimum', $label.' Batas Lulus', $label.' Basis Batas', $label.' Lulus');
        }
        yield $headers;
        foreach ($reports->participantsQuery($tryOut, $filters)->lazyById(200, 'try_out_attempts.id', 'id') as $attempt) {
            $p = $reports->participant($attempt);
            $row = [$p['id'], $p['user_id'], $p['name'], $p['whatsapp'], $attempt->started_at?->copy()->timezone('Asia/Jakarta'),
                $attempt->completed_at?->copy()->timezone('Asia/Jakarta'), $p['status'], $p['raw_score'], $p['final_score'], $p['max_score'], $p['overall_pass']];
            $sessions = array_column($p['sessions'], null, 'code');
            foreach (array_keys(TryOutService::SESSIONS) as $code) {
                $section = $sessions[$code] ?? [];
                array_push($row, $section['earned'] ?? null, $section['max'] ?? null, $section['passing_score'] ?? null,
                    $section['passing_score_basis'] ?? null, $section['pass'] ?? null);
            }
            yield $row;
        }
    }

    private function questionRows(array $report): \Generator
    {
        yield ['Versi', 'Soal ID', 'Fingerprint', 'Sesi', 'Nomor', 'Soal', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Kunci', 'Poin', 'Diterima', 'Tidak Diterima', 'Benar', 'Salah', 'Kosong', 'Benar (%)', 'A Jumlah', 'A (%)', 'B Jumlah', 'B (%)', 'C Jumlah', 'C (%)', 'D Jumlah', 'D (%)', 'Penjelasan', 'Judul Bacaan', 'Bacaan', 'Instruksi', 'Jepang', 'Audio URL'];
        foreach ($report['questions'] as $q) {
            $row = [$q['version'], $q['id'], $q['fingerprint'], $q['section'], $q['number'], $q['question']];
            foreach (['A', 'B', 'C', 'D'] as $option) {
                $row[] = $q['options'][$option] ?? '';
            }
            array_push($row, $q['correct_option'], $q['grading']['point_value'] ?? null, $q['received'], $q['not_received'],
                $q['correct'], $q['wrong'], $q['unanswered'], $q['correct_percentage']);
            foreach (['A', 'B', 'C', 'D'] as $option) {
                array_push($row, $q['distribution'][$option]['count'], $q['distribution'][$option]['percentage']);
            }
            array_push($row, $q['grading']['explanation'] ?? '', $q['passage']['title'] ?? '',
                $q['passage']['body'] ?? $q['content']['reading_passage'] ?? '', $q['content']['instruction'] ?? '',
                $q['content']['japanese'] ?? '', $q['content']['audio_url'] ?? '');
            yield $row;
        }
    }

    private function answerRows(TryOut $tryOut, array $filters, AdminTryOutReportService $reports): \Generator
    {
        yield ['Attempt ID', 'User ID', 'Nama', 'Mulai (Jakarta)', 'Selesai (Jakarta)', 'Raw Score', 'Final Score', 'Lulus', 'Soal ID', 'Versi', 'Sesi', 'Nomor', 'Soal', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Jawaban', 'Kunci', 'Hasil', 'Poin', 'Poin Diperoleh', 'Penjelasan', 'Judul Bacaan', 'Bacaan', 'Instruksi', 'Jepang', 'Audio URL'];
        foreach ($reports->participantsQuery($tryOut, $filters)->lazyById(200, 'try_out_attempts.id', 'id') as $attempt) {
            foreach ($attempt->content_snapshot ?? [] as $index => $question) {
                $q = $reports->questionVersion($question, $attempt->grading_snapshot ?? []);
                $answer = $attempt->answers[$question['id']] ?? null;
                $outcome = $reports->outcome($answer, $q['grading']);
                $score = $attempt->result_snapshot['earned'] ?? null;
                $row = [$attempt->id, $attempt->user_id, $attempt->participant_name,
                    $attempt->started_at?->copy()->timezone('Asia/Jakarta'), $attempt->completed_at?->copy()->timezone('Asia/Jakarta'),
                    $score, $score, $attempt->result_snapshot['overall_pass'] ?? null,
                    $question['id'], $q['version'], $q['session'], $index + 1, $question['question'] ?? ''];
                foreach (['A', 'B', 'C', 'D'] as $option) {
                    $row[] = $question['options'][$option] ?? '';
                }
                array_push($row, $answer, $q['grading']['correct_option'] ?? null,
                    $outcome === 'blank' ? 'unanswered' : $outcome, $q['grading']['point_value'] ?? null,
                    $outcome === 'correct' ? ($q['grading']['point_value'] ?? 0) : 0, $q['grading']['explanation'] ?? '',
                    $q['passage']['title'] ?? '', $q['passage']['body'] ?? $question['reading_passage'] ?? '',
                    $question['instruction'] ?? '', $question['japanese'] ?? '', $question['audio_url'] ?? '');
                yield $row;
            }
        }
    }

    public function build(TryOut $tryOut, array $filters, AdminTryOutReportService $reports): string
    {
        $path = null;
        try {
            return $reports->readSnapshot(function () use ($tryOut, $filters, $reports, &$path) {
                $path = $this->buildSnapshot($tryOut, $filters, $reports);

                return $path;
            });
        } catch (\Throwable $error) {
            if ($path !== null) {
                @unlink($path);
            }
            throw $error;
        }
    }

    private function buildSnapshot(TryOut $tryOut, array $filters, AdminTryOutReportService $reports): string
    {
        $path = tempnam(sys_get_temp_dir(), 'tryout-report-');
        if ($path === false) {
            throw new RuntimeException('Unable to create report file.');
        }
        $zip = new ZipArchive;
        $streams = [];
        $opened = false;
        try {
            if ($zip->open($path, ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('Unable to create report archive.');
            }
            $opened = true;
            $report = $reports->overview($tryOut, $filters, true);
            $sheets = ['Ringkasan' => $this->summaryRows($report), 'Peserta' => $this->participantRows($tryOut, $filters, $reports),
                'Analisis Soal' => $this->questionRows($report), 'Jawaban Individual' => $this->answerRows($tryOut, $filters, $reports)];
            $types = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
            $workbook = '';
            $relations = '';
            $i = 0;
            foreach ($sheets as $name => $rows) {
                $i++;
                $stream = tmpfile();
                if ($stream === false) {
                    throw new RuntimeException('Unable to create report worksheet.');
                }
                $streams[] = $stream;
                $this->sheet($stream, $rows);
                fflush($stream);
                if (! $zip->addFile(stream_get_meta_data($stream)['uri'], 'xl/worksheets/sheet'.$i.'.xml')) {
                    throw new RuntimeException('Unable to add report worksheet.');
                }
                $types .= '<Override PartName="/xl/worksheets/sheet'.$i.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
                $workbook .= '<sheet name="'.$this->xml($name).'" sheetId="'.$i.'" r:id="rId'.$i.'"/>';
                $relations .= '<Relationship Id="rId'.$i.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$i.'.xml"/>';
            }
            $files = [
                '[Content_Types].xml' => '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'.$types.'</Types>',
                '_rels/.rels' => '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
                'xl/workbook.xml' => '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'.$workbook.'</sheets></workbook>',
                'xl/_rels/workbook.xml.rels' => '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$relations.'<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
                'xl/styles.xml' => '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
            ];
            foreach ($files as $name => $xml) {
                if (! $zip->addFromString($name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.$xml)) {
                    throw new RuntimeException('Unable to write report archive.');
                }
            }
            if (! $zip->close()) {
                throw new RuntimeException('Unable to finish report archive.');
            }
            $opened = false;

            return $path;
        } catch (\Throwable $error) {
            if ($opened) {
                $zip->close();
            }
            @unlink($path);
            throw $error;
        } finally {
            foreach ($streams as $stream) {
                fclose($stream);
            }
        }
    }
}
