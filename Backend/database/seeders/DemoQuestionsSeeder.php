<?php

namespace Database\Seeders;

use App\Models\AudioQuestion;
use App\Models\Chapter;
use App\Models\CheckpointPackage;
use App\Models\CheckpointQuestion;
use App\Models\CheckpointStudioQuestion;
use App\Models\Program;
use App\Models\ReadingPassage;
use App\Models\ReadingQuestion;
use App\Models\TryOutQuestion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoQuestionsSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $programs = Program::whereIn('code', ['n5', 'n4', 'n3', 'n2', 'n1'])->get()->keyBy('code');

            $audioPool = TryOutQuestion::whereNotNull('audio_url')
                ->where('status', 'published')
                ->pluck('audio_url')
                ->unique()
                ->values()
                ->all();

            if (count($audioPool) < 20) {
                $fallbackAudios = TryOutQuestion::whereNotNull('audio_url')->pluck('audio_url')->unique()->values()->all();
                while (count($audioPool) < 20 && count($fallbackAudios) > 0) {
                    $audioPool[] = $fallbackAudios[count($audioPool) % count($fallbackAudios)];
                }
            }

            $audioDataset = $this->getAudioQuestionsData($audioPool);
            $readingDataset = $this->getReadingPassagesData();
            $checkpointDataset = $this->getCheckpointQuestionsData($audioPool);

            // 1. Seed Audio Questions for Chapter 1 of each JLPT program
            foreach ($programs as $code => $program) {
                $chapter = Chapter::where('program_id', $program->id)->orderBy('sort_order')->orderBy('id')->first();
                if (! $chapter) {
                    continue;
                }

                // Remove previous demo audio questions for clean idempotent state
                AudioQuestion::where('chapter_id', $chapter->id)->delete();

                foreach ($audioDataset as $index => $item) {
                    AudioQuestion::create([
                        'chapter_id' => $chapter->id,
                        'title' => $item['title'],
                        'audio_url' => $item['audio_url'],
                        'question' => $item['question'],
                        'options' => $item['options'],
                        'correct_option' => $item['correct_option'],
                        'explanation' => $item['explanation'],
                        'sort_order' => $index + 1,
                        'status' => 'published',
                    ]);
                }
            }

            // 2. Seed Reading Passages & 20 Reading Questions for Chapter 1 of each JLPT program
            foreach ($programs as $code => $program) {
                $chapter = Chapter::where('program_id', $program->id)->orderBy('sort_order')->orderBy('id')->first();
                if (! $chapter) {
                    continue;
                }

                // Clean old reading passages & questions for this chapter
                ReadingPassage::where('chapter_id', $chapter->id)->delete();

                foreach ($readingDataset as $passageOrder => $passageData) {
                    $passage = ReadingPassage::create([
                        'chapter_id' => $chapter->id,
                        'title' => $passageData['title'],
                        'body' => $passageData['body'],
                        'sort_order' => $passageOrder + 1,
                        'status' => 'published',
                    ]);

                    foreach ($passageData['questions'] as $qOrder => $qData) {
                        ReadingQuestion::create([
                            'reading_passage_id' => $passage->id,
                            'question' => $qData['question'],
                            'options' => $qData['options'],
                            'correct_option' => $qData['correct_option'],
                            'explanation' => $qData['explanation'],
                            'sort_order' => $qOrder + 1,
                            'status' => 'published',
                        ]);
                    }
                }
            }

            // 3. Seed Checkpoint Packages & Checkpoint Studio Questions (20 questions per package)
            foreach ($programs as $code => $program) {
                $levelUpper = strtoupper($code);
                $package = CheckpointPackage::updateOrCreate(
                    ['program_id' => $program->id, 'sort_order' => 1],
                    [
                        'title' => "Checkpoint {$levelUpper} - Evaluasi Akhir Level",
                        'access_type' => 'membership',
                        'status' => 'published',
                        'duration_minutes' => 60,
                        'max_score' => 180,
                        'total_passing_score' => 80,
                        'session_passing_scores' => [
                            'vocabulary_kanji' => 19,
                            'grammar' => 19,
                            'reading' => 19,
                            'audio' => 19,
                        ],
                    ]
                );

                // Clean old studio questions for idempotent replacement
                CheckpointStudioQuestion::where('checkpoint_package_id', $package->id)->delete();

                foreach ($checkpointDataset as $index => $q) {
                    CheckpointStudioQuestion::create([
                        'checkpoint_package_id' => $package->id,
                        'session' => $q['session'],
                        'question' => $q['question'],
                        'options' => $q['options'],
                        'correct_option' => $q['correct_option'],
                        'explanation' => $q['explanation'],
                        'point_value' => 9, // 20 * 9 = 180 points total
                        'reading_passage' => $q['reading_passage'] ?? null,
                        'audio_url' => $q['audio_url'] ?? null,
                        'sort_order' => $index + 1,
                        'status' => 'published',
                    ]);
                }

                // Also populate legacy CheckpointQuestion if chapter exists
                $chapter = Chapter::where('program_id', $program->id)->orderBy('sort_order')->orderBy('id')->first();
                if ($chapter) {
                    CheckpointQuestion::where('chapter_id', $chapter->id)->delete();
                    foreach ($checkpointDataset as $index => $q) {
                        CheckpointQuestion::create([
                            'chapter_id' => $chapter->id,
                            'question' => $q['question'],
                            'options' => $q['options'],
                            'correct_option' => $q['correct_option'],
                            'explanation' => $q['explanation'],
                            'sort_order' => $index + 1,
                            'status' => 'published',
                        ]);
                    }
                }
            }
        });
    }

    private function getAudioQuestionsData(array $audioPool): array
    {
        return [
            [
                'title' => 'Percakapan 1: Waktu Keberangkatan Kereta (電車の出発時間)',
                'audio_url' => $audioPool[0],
                'question' => "男の人と女の人が話しています。次の電車は何時に出発しますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '10時15分', 'B' => '10時30分', 'C' => '10時45分', 'D' => '11時00分'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n男：すみません、東京行きの次の電車は何時ですか。\n女：10時15分の快速は出たばかりです。次は10時30分の各駅停車ですね。\n男：分かりました。それに乗ります。\n\n【解説】\nKereta cepat pukul 10:15 baru saja berangkat. Kereta berikutnya adalah kereta lokal pukul 10:30 (10時30分). Jawaban benar: B.",
            ],
            [
                'title' => 'Percakapan 2: Tempat Pertemuan di Stasiun (駅での待ち合わせ)',
                'audio_url' => $audioPool[1],
                'question' => "二人はどこで待ち合わせをしますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '駅の改札口の前', 'B' => '改札口の横のカフェ', 'C' => '本屋の前', 'D' => '南口の時計台の下'],
                'correct_option' => 'D',
                'explanation' => "【スクリプト】\n女：明日は駅の改札前で待ち合わせにする？\n男：改札前は人が多いから、南口の時計台の下はどう？\n女：あ、そこいいね。じゃあ、そこにしよう。\n\n【解説】\nKarena area depan gerbang tiket terlalu ramai, mereka sepakat bertemu di bawah menara jam pintu selatan (南口の時計台の下). Jawaban benar: D.",
            ],
            [
                'title' => 'Percakapan 3: Pesanan di Restoran (レストランでの注文)',
                'audio_url' => $audioPool[2],
                'question' => "女の人は何を注文しましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => 'カレーライスとアイスコーヒー', 'B' => 'ラーメンとウーロン茶', 'C' => '天丼と温かい緑茶', 'D' => 'ハンバーグ定食とリンゴジュース'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n店員：ご注文はお決まりですか。\n女：ええと、カレーライスを一つと、飲み物はアイスコーヒーをお願いします。\n店員：かしこまりました。\n\n【解説】\nPembicara memesan nasi kari dan es kopi (カレーライスとアイスコーヒー). Jawaban benar: A.",
            ],
            [
                'title' => 'Percakapan 4: Jadwal Tugas Hari Ini (今日の仕事の予定)',
                'audio_url' => $audioPool[3],
                'question' => "男の人は午後まず何をしなければなりませんか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '会議の資料をコピーする', 'B' => 'クライアントに電話をかける', 'C' => '部長へ報告書を提出する', 'D' => '郵便局へ荷物を取りに行く'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n女：午後2時からの会議の準備は終わった？\n男：あ、資料のコピーがまだでした。これから急いでやっておきます。\n女：よろしくね。\n\n【解説】\nTugas yang belum selesai dan harus segera dikerjakan adalah memfotokopi materi rapat (会議の資料をコピーする). Jawaban benar: A.",
            ],
            [
                'title' => 'Percakapan 5: Hadiah Ulang Tahun untuk Rekan (同僚へのプレゼント)',
                'audio_url' => $audioPool[4],
                'question' => "二人は佐藤さんに何をあげることにしましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => 'ネクタイ', 'B' => '万年筆', 'C' => '卓上時計', 'D' => 'コーヒーのギフトセット'],
                'correct_option' => 'D',
                'explanation' => "【スクリプト】\n男：佐藤さんの誕生日、ネクタイはどうかな。\n女：佐藤さんはネクタイあまり使わないよ。コーヒーが大好きだから、美味しい豆のギフトセットにしない？\n男：それ、すごくいいね！それにしよう。\n\n【解説】\nKarena Sato sangat suka kopi, mereka memutuskan memberikannya bingkisan set kopi (コーヒーのギフトセット). Jawaban benar: D.",
            ],
            [
                'title' => 'Percakapan 6: Cuaca Akhir Pekan (週末の天気)',
                'audio_url' => $audioPool[5],
                'question' => "日曜日、二人は何をすることにしましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '山登りに行く', 'B' => '映画館で映画を見る', 'C' => '海で泳ぐ', 'D' => '家で掃除をする'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n男：日曜日、ハイキングに行かない？\n女：天気予報によると、日曜日は強い雨が降るみたいだよ。\n男：じゃあ外は無理だね。新しくできた映画館に行こうか。\n女：うん、そうしよう。\n\n【解説】\nKarena hujan lebat diprediksi turun, mereka memutuskan pergi menonton film di bioskop (映画館で映画を見る). Jawaban benar: B.",
            ],
            [
                'title' => 'Percakapan 7: Jam Operasional Perpustakaan (図書館の利用時間)',
                'audio_url' => $audioPool[6],
                'question' => "図書館は何時まで開いていますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '午後5時まで', 'B' => '午後6時まで', 'C' => '午後7時まで', 'D' => '午後8時まで'],
                'correct_option' => 'D',
                'explanation' => "【スクリプト】\n男：すみません、この図書館は何時まで利用できますか。\n女：平日は午後8時まで、土日は午後5時までとなっております。\n男：今日は水曜日ですね。ありがとうございます。\n\n【解説】\nHari Rabu merupakan hari kerja (平日), sehingga perpustakaan buka sampai jam 8 malam (午後8時まで). Jawaban benar: D.",
            ],
            [
                'title' => 'Percakapan 8: Membeli Tiket Bus (バスの切符購入)',
                'audio_url' => $audioPool[7],
                'question' => "男の人はいくら払いましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '600円', 'B' => '1,000円', 'C' => '1,200円', 'D' => '1,500円'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n男：空港行きのバスの切符を大人2枚お願いします。\n係員：1枚600円ですので、2枚で1,200円になります。\n男：はい、1,200円ちょうどです。\n\n【解説】\nTiket dewasa 600 yen per lembar, beli 2 lembar = 1.200 yen (1,200円). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 9: Lokasi Barang Tertinggal (忘れ物の場所)',
                'audio_url' => $audioPool[8],
                'question' => "女の人の鍵はどこにありましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '机の引き出しの中', 'B' => 'ソファーのすき間', 'C' => 'ジャケットのポケット', 'D' => '玄関の靴箱の上'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n女：家の鍵が見当たらないの。机の上にもソファーにもないわ。\n男：さっき着ていた上着のポケットは確認した？\n女：あ、あった！ポケットの中に入ってたわ。ありがとう。\n\n【解説】\nKunci ditemukan di dalam saku jaket yang dikenakan sebelumnya (ジャケットのポケット). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 10: Penggantian Jadwal Bimbingan (面談日時の変更)',
                'audio_url' => $audioPool[9],
                'question' => "面談はいつに変更されましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '木曜日の午後2時', 'B' => '木曜日の午後4時', 'C' => '金曜日の午前10時', 'D' => '金曜日の午後2時'],
                'correct_option' => 'D',
                'explanation' => "【スクリプト】\n学生：先生、木曜日の面談ですが、授業が入ってしまって伺えなくなりました。\n先生：そうか。じゃあ金曜日の午後はどう？2時からなら空いてるよ。\n学生：はい、金曜日の午後2時にお願いします。\n\n【解説】\nJadwal konsultasi dipindahkan ke hari Jumat pukul 2 siang (金曜日の午後2時). Jawaban benar: D.",
            ],
            [
                'title' => 'Percakapan 11: Transportasi ke Bandara (空港までの交通手段)',
                'audio_url' => $audioPool[10],
                'question' => "男の人はどうやって空港へ行くことにしましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => 'タクシー', 'B' => '直通リムジンバス', 'C' => '特急電車', 'D' => '地下鉄と徒歩'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n女：空港まではリムジンバスが便利だけど、夕方は渋滞するかも。\n男：飛行機に遅れたら困るから、時間の正確な特急電車で行くよ。\n女：それが一番安心ね。\n\n【解説】\nAgar tidak terlambat pesawat akibat kemacetan, pembicara memilih kereta ekspres yang tepat waktu (特急電車). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 12: Membeli Oleh-oleh (お土産の購入)',
                'audio_url' => $audioPool[11],
                'question' => "女の人は家族にどのお土産を買いますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '抹茶のお菓子', 'B' => '伝統工芸の扇子', 'C' => '緑茶の茶葉', 'D' => '絵はがきセット'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n男：京都のお土産、何にするの？\n女：家族みんな甘いものが好きだから、有名な抹茶のお菓子を買って帰るわ。\n男：いいね、きっと喜ばれるよ。\n\n【解説】\nKarena keluarganya menyukai makanan manis, ia membeli camilan matcha (抹茶のお菓子). Jawaban benar: A.",
            ],
            [
                'title' => 'Percakapan 13: Bantuan Tugas Kantor (オフィスでの手伝い)',
                'audio_url' => $audioPool[12],
                'question' => "男の人はこれから何を頼まれましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '会議室の机と椅子の配置', 'B' => '参加者の名札の作成', 'C' => '案内メールの送信', 'D' => 'お茶の用意'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n女：田中さん、3階の第2会議室、机と椅子をコの字型に並べ替えてもらえる？\n男：はい、すぐやっておきます。\n女：助かるわ、よろしくね。\n\n【解説】\nPembicara wanita meminta tolong untuk menata meja dan kursi di ruang rapat ke-2 (会議室の机と椅子の配置). Jawaban benar: A.",
            ],
            [
                'title' => 'Percakapan 14: Pilihan Menu Sehat (健康的なランチ選び)',
                'audio_url' => $audioPool[13],
                'question' => "男の人がこの定食を選んだ理由は何ですか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '値段が一番安いから', 'B' => '野菜がたくさん入っているから', 'C' => 'ご飯のおかわりが自由だから', 'D' => '提供時間が早いから'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n女：唐揚げ定食じゃなくて、焼き魚定食にしたの？珍しいね。\n男：最近野菜不足だからね。この定食は小鉢の野菜がたくさん付いてるんだ。\n女：へえ、健康的でいいね。\n\n【解説】\nAlasan memilih set menu ikan bakar adalah karena ingin memperbanyak porsi sayuran (野菜がたくさん入っているから). Jawaban benar: B.",
            ],
            [
                'title' => 'Percakapan 15: Penanganan Keluhan Paket (荷物の配達確認)',
                'audio_url' => $audioPool[14],
                'question' => "配達員は不在のときどうすることになりましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '荷物を持ち帰る', 'B' => '隣の部屋の人に預ける', 'C' => '宅配ボックスに入れる', 'D' => '玄関の前に置く'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n配達員：もし夕方ご不在の場合はどういたしましょうか。\n客：マンションの1階に宅配ボックスがありますので、そこに入れておいていただけますか。\n配達員：承知いたしました。\n\n【解説】\nPelanggan meminta paket dimasukkan ke dalam loker pengantaran (宅配ボックスに入れる) bila ia tidak di tempat. Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 16: Pendaftaran Kursus Olahraga (スポーツジムの申し込み)',
                'audio_url' => $audioPool[15],
                'question' => "登録に必要なものはどれですか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '身分証明書とキャッシュカード', 'B' => 'パスポートと現金5万円', 'C' => '印鑑と健康診断書', 'D' => '写真2枚と推薦状'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n受付：本日のご入会手続きには、ご本人確認ができる身分証明書とお引き落とし用のキャッシュカードが必要となります。\n客：両方持ってきています。\n\n【解説】\nDokumen yang disyaratkan adalah kartu identitas (身分証明書) dan kartu ATM/debit (キャッシュカード). Jawaban benar: A.",
            ],
            [
                'title' => 'Percakapan 17: Kegiatan Sukarelawan (週末のボランティア)',
                'audio_url' => $audioPool[16],
                'question' => "ボランティア活動は何時から始まりますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '午前8時30分', 'B' => '午前9時00分', 'C' => '午前9時30分', 'D' => '午前10時00分'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n男：明日の海岸清掃ボランティア、集合は何時だっけ。\n女：9時集合で、受付を済ませて活動開始は9時30分からよ。\n男：了解、遅れないように行くよ。\n\n【解説】\nWaktu kumpul jam 9:00, namun kegiatan bersih-bersih dimulai jam 9:30 (午前9時30分). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 18: Perbaikan AC Rusak (エアコンの修理依頼)',
                'audio_url' => $audioPool[17],
                'question' => "業者はいつ部屋に来ますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '今日の夕方', 'B' => '明日の午前中', 'C' => '明日の午後3時', 'D' => '明後日の午前中'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n業者：エアコンの点検ですが、明日の午後3時はいかがでしょうか。\n客：明日の午後3時ですね、在宅しておりますのでお願いいたします。\n業者：では明日3時にお伺いいたします。\n\n【解説】\nTukang servis disepakati datang besok jam 3 sore (明日の午後3時). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 19: Reservasi Makan Malam (送別会の予約)',
                'audio_url' => $audioPool[18],
                'question' => "何人で予約しますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '6人', 'B' => '7人', 'C' => '8人', 'D' => '9人'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n女：来週の送別会、何人集まりそう？\n男：課長と先輩3人、それに僕たち4人だから、合計8人だね。\n女：じゃあ8人で居酒屋を予約しておくね。\n\n【解説】\nKachou (1) + senpai (3) + kita (4) = 8 orang (8人). Jawaban benar: C.",
            ],
            [
                'title' => 'Percakapan 20: Persiapan Presentasi Proyek (プレゼンの最終チェック)',
                'audio_url' => $audioPool[19],
                'question' => "スライドのどこを修正することにしましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => 'グラフの色をはっきりさせる', 'B' => '文字のサイズを小さくする', 'C' => '最後のページを削除する', 'D' => 'タイトルを英語に変える'],
                'correct_option' => 'A',
                'explanation' => "【スクリプト】\n男：プレゼンのスライド、全体的に見やすいね。\n女：でも、5ページ目の売上グラフ、プロジェクターだと薄くて見づらくないかな？\n男：確かに。もっとコントラストの高い、はっきりした色に変更しておこう。\n\n【解説】\nWarna grafik di slide 5 dikhawatirkan pudar jika disorot proyektor, sehingga diubah ke warna yang lebih kontras/jelas (グラフの色をはっきりさせる). Jawaban benar: A.",
            ],
        ];
    }

    private function getReadingPassagesData(): array
    {
        return [
            [
                'title' => '【案内】留学生のための日本生活オリエンテーション (Orientasi Kehidupan di Jepang)',
                'body' => "留学生のみなさんへ\n\n来週の水曜日（11月5日）、午後1時から3時まで、新入留学生を対象とした「日本生活オリエンテーション」を国際交流センター2階の大ホールで行います。\n\nこのオリエンテーションでは、市区町村役場での住民登録の手続き、健康保険の加入方法、銀行口座の開設、そしてゴミの正しい分別ルールについて詳しく説明します。\n特にゴミの分別については、地域によって回収日や指定のゴミ袋が異なりますので、必ず参加して資料を受け取ってください。\n\n【持ち物】\n1. 在留カード（またはパスポート）\n2. 学生証\n3. 筆記用具\n\n参加費は無料ですが、資料の準備がありますので、参加希望者は前日の火曜日午後5時までに、国際交流センターの受付またはウェブサイトから申し込んでください。\n遅刻した場合は入場できないことがありますので、開始10分前には着席してください。",
                'questions' => [
                    [
                        'question' => 'オリエンテーションはどこで行われますか。',
                        'options' => ['A' => '大学の図書館', 'B' => '国際交流センター2階の大ホール', 'C' => '市役所の1階会議室', 'D' => '留学生会館の食堂'],
                        'correct_option' => 'B',
                        'explanation' => 'Teks secara eksplisit menyebutkan:「国際交流センター2階の大ホールで行います」. Jawaban benar: B.',
                    ],
                    [
                        'question' => 'このオリエンテーションで説明されないものはどれですか。',
                        'options' => ['A' => '住民登録の手続き', 'B' => '健康保険の加入方法', 'C' => 'ゴミの分別ルール', 'D' => 'アルバイトの面接練習'],
                        'correct_option' => 'D',
                        'explanation' => 'Teks membahas pendaftaran penduduk, asuransi, rekening bank, dan pemilahan sampah. Latihan wawancara paruh waktu tidak dibahas. Jawaban benar: D.',
                    ],
                    [
                        'question' => '参加者が持って行かなければならないものはどれですか。',
                        'options' => ['A' => '在留カード、学生証、筆記用具', 'B' => '健康保険証と現金3,000円', 'C' => '写真2枚と印鑑', 'D' => 'ゴミ袋と教科書'],
                        'correct_option' => 'A',
                        'explanation' => 'Pada bagian【持ち物】disebutkan: 1. 在留カード 2. 学生証 3. 筆記用具. Jawaban benar: A.',
                    ],
                    [
                        'question' => '参加したい人はいつまでに申し込まなければなりませんか。',
                        'options' => ['A' => '水曜日の午前中まで', 'B' => '月曜日の正午まで', 'C' => '前日の火曜日午後5時まで', 'D' => 'オリエンテーション開始直前まで'],
                        'correct_option' => 'C',
                        'explanation' => 'Disebutkan:「前日の火曜日午後5時までに…申し込んでください」. Jawaban benar: C.',
                    ],
                    [
                        'question' => '本文の内容と合っているものはどれですか。',
                        'options' => ['A' => '参加費として1,000円必要である', 'B' => 'ゴミの分別ルールは地域によって異なる', 'C' => '遅刻してもいつでも途中入場できる', 'D' => '申し込みなしで当日直接参加できる'],
                        'correct_option' => 'B',
                        'explanation' => 'Teks menyatakan:「地域によって回収日や指定のゴミ袋が異なります」, sehingga aturan pemilahan berbeda tiap daerah. Jawaban benar: B.',
                    ],
                ],
            ],
            [
                'title' => '【業務連絡】社内システム定期メンテナンスのお知らせ (Pemeliharaan Sistem Internal)',
                'body' => "社員各位\n\n情報システム部より、社内基幹システムの定期メンテナンスについてお知らせいたします。\n\nサービスの安定運用およびセキュリティ強化のため、下記の日程でシステムメンテナンスを実施いたします。\nメンテナンス中は、社内メールの送受信、勤怠管理システムへの打刻、および共有サーバー上のファイルへのアクセスがすべて停止します。\n\n【メンテナンス日時】\n2026年11月14日（土）午後10時00分 ～ 11月15日（日）午前6時00分\n\n【注意事項】\n1. メンテナンス開始前（土曜日の午後9時50分まで）に、編集中のデータは必ず保存し、パソコンをシャットダウンしてください。\n2. メンテナンス時間中に外部から届いたメールは、作業終了後に順次配信されますが、緊急の連絡が必要な場合は、各自社用携帯電話をご利用ください。\n3. 日曜日の午前6時以降、通常どおりシステムをご利用いただけますが、万が一ログインできない場合は、月曜日の朝9時以降に内線104（情報システムヘルプデスク）までご連絡ください。\n\nご不便をおかけいたしますが、ご理解とご協力のほどよろしくお願い申し上げます。",
                'questions' => [
                    [
                        'question' => 'メンテナンスの主な目的は何ですか。',
                        'options' => ['A' => 'サービスの安定運用とセキュリティの強化', 'B' => '新しいパソコンの配布', 'C' => 'オフィスの模様替え', 'D' => '社員の個人データ削除'],
                        'correct_option' => 'A',
                        'explanation' => 'Teks menyatakan:「サービスの安定運用およびセキュリティ強化のため」. Jawaban benar: A.',
                    ],
                    [
                        'question' => 'メンテナンスが実施される時間はいつですか。',
                        'options' => ['A' => '土曜日の朝9時から夕方5時まで', 'B' => '日曜日の午前0時から午前12時まで', 'C' => '土曜日の午後10時から日曜日の午前6時まで', 'D' => '金曜日の夜から月曜日の朝まで'],
                        'correct_option' => 'C',
                        'explanation' => 'Jadwal tertera:「11月14日（土）午後10時00分 ～ 11月15日（日）午前6時00分」. Jawaban benar: C.',
                    ],
                    [
                        'question' => 'メンテナンス中も緊急時に利用できる手段は何ですか。',
                        'options' => ['A' => '社内メールシステム', 'B' => '共有サーバーのファイル', 'C' => '勤怠打刻システム', 'D' => '各自の社用携帯電話'],
                        'correct_option' => 'D',
                        'explanation' => 'Disebutkan:「緊急の連絡が必要な場合は、各自社用携帯電話をご利用ください」. Jawaban benar: D.',
                    ],
                    [
                        'question' => '社員は土曜日の午後9時50分までに何をしなければなりませんか。',
                        'options' => ['A' => 'オフィスの戸締りを確認する', 'B' => '編集中のデータを保存してパソコンを終了する', 'C' => 'ヘルプデスクに電話をかける', 'D' => 'すべてのメールを削除する'],
                        'correct_option' => 'B',
                        'explanation' => 'Petunjuk 1 menyatakan:「編集中のデータは必ず保存し、パソコンをシャットダウンしてください」. Jawaban benar: B.',
                    ],
                    [
                        'question' => '日曜日の朝にシステムへログインできなかった場合、どうすればよいですか。',
                        'options' => ['A' => 'パスワードを再発行する', 'B' => '日曜日のうちに自宅から会社へ来る', 'C' => '月曜日の朝9時以降にヘルプデスクへ連絡する', 'D' => 'すぐにパソコンを買い替える'],
                        'correct_option' => 'C',
                        'explanation' => 'Petunjuk 3 menyebutkan:「月曜日の朝9時以降に内線104（情報システムヘルプデスク）までご連絡ください」. Jawaban benar: C.',
                    ],
                ],
            ],
            [
                'title' => '【エッセイ】日本のリサイクルショップと不用品の活用 (Pemanfaatan Toko Daur Ulang di Jepang)',
                'body' => "日本で暮らし始めて驚いたことの一つに、「リサイクルショップ」の便利さがあります。\n私が日本に来たばかりのころ、アパートには家具も家電も何もありませんでした。新品の冷蔵庫や洗濯機、机などを全部揃えると十数万円もかかってしまいます。困っていたとき、大学の先輩が近所のリサイクルショップを教えてくれました。\n\n実際に店に行ってみると、まるで新品のようにきれいに掃除された電子レンジや炊飯器が、定価の半額以下で売られていました。お店の人が動作を確認し、3か月の保証まで付けてくれたので、安心して買うことができました。\n\nまた、リサイクルショップは買うだけでなく、自分が使わなくなったものを売ることもできます。日本を離れるときや引っ越しのとき、粗大ゴミとして処分するとお金がかかりますが、まだ使えるものなら買い取ってもらえます。環境にも優しく、お財布にも優しい素晴らしい仕組みだと感じています。",
                'questions' => [
                    [
                        'question' => '筆者が日本に来た当初、何に困っていましたか。',
                        'options' => ['A' => '大学の授業についていけなかったこと', 'B' => '家具や家電を新品で揃えると費用が高すぎたこと', 'C' => '住むアパートが見つからなかったこと', 'D' => '日本語が全く通じなかったこと'],
                        'correct_option' => 'B',
                        'explanation' => 'Paragraf 1 menjelaskan biaya membeli barang baru bisa mencapai belasan puluh ribu yen (十数万円) sehingga penulis bingung. Jawaban benar: B.',
                    ],
                    [
                        'question' => '筆者がリサイクルショップで安心して家電を買えた理由は何ですか。',
                        'options' => ['A' => '動作確認がされ、3か月の保証が付いていたから', 'B' => '無料で自宅まで配達してくれたから', 'C' => '大学の先生が経営している店だったから', 'D' => '最新の型番の商品ばかりだったから'],
                        'correct_option' => 'A',
                        'explanation' => 'Teks menyebutkan:「動作を確認し、3か月の保証まで付けてくれたので、安心して買うことができました」. Jawaban benar: A.',
                    ],
                    [
                        'question' => '店で売られていた家電の価格はどうでしたか。',
                        'options' => ['A' => '新品より高かった', 'B' => '新品と同じ値段だった', 'C' => '定価の半額以下だった', 'D' => 'すべて100円だった'],
                        'correct_option' => 'C',
                        'explanation' => 'Teks menyebutkan:「定価の半額以下で売られていました」. Jawaban benar: C.',
                    ],
                    [
                        'question' => '引っ越しなどの際に不用品をリサイクルショップに売る利点は何ですか。',
                        'options' => ['A' => '新しい家具と物々交換できること', 'B' => '壊れたゴミでも高値で売れること', 'C' => '大学から奨学金がもらえること', 'D' => '処分費用を払わずに買い取ってもらえること'],
                        'correct_option' => 'D',
                        'explanation' => 'Teks menjelaskan bila dibuang sebagai sampah besar ada biaya, tetapi di toko daur ulang barang yang layak dapat dibeli (買い取ってもらえます). Jawaban benar: D.',
                    ],
                    [
                        'question' => '筆者は日本のリサイクルショップについてどう評価していますか。',
                        'options' => ['A' => '環境にも経済的にも優しい素晴らしい仕組みだと思っている', 'B' => '品質が悪くあまり利用したくないと思っている', 'C' => '留学生には利用が難しすぎると思っている', 'D' => '粗大ゴミのほうが便利だと思っている'],
                        'correct_option' => 'A',
                        'explanation' => 'Kalimat penutup menyatakan:「環境にも優しく、お財布にも優しい素晴らしい仕組みだと感じています」. Jawaban benar: A.',
                    ],
                ],
            ],
            [
                'title' => '【コラム】日本の職場における「報・連・相」の重要性 (Etika Komunikasi Horenso)',
                'body' => "日本の会社で円滑に仕事を進めるためには、「報・連・相（ほうれんそう）」が極めて重要だとされています。「報・連・相」とは、「報告」「連絡」「相談」の3つの言葉の頭文字を取ったビジネス用語です。\n\nまず「報告」とは、上司や先輩から指示された仕事の進み具合や結果を知らせることです。特にトラブルが発生したときは、小さくてもすぐに報告しなければなりません。後回しにすると、問題が大きくなって会社全体に迷惑をかけてしまうからです。\n\n次に「連絡」は、仕事に関する事実や予定の変更を、関係するすべての人に伝えることです。自分の意見や推測を入れず、客観的な事実を迅速に共有することが求められます。\n\n最後に「相談」は、仕事で迷ったり判断に困ったりしたときに、上司や同僚に意見を聞くことです。一人で抱え込まずに早めに相談することで、ミスを防ぎ、より良い解決策を見つけることができます。\nこの3つを日頃から意識することで、職場の信頼関係が深まり、チーム全体の成果につながるのです。",
                'questions' => [
                    [
                        'question' => '「報・連・相」は何の頭文字を取った言葉ですか。',
                        'options' => ['A' => '報告・連絡・相談', 'B' => '方針・連続・総合', 'C' => '法規・連帯・相互', 'D' => '本気・練習・創意'],
                        'correct_option' => 'A',
                        'explanation' => 'Paragraf pertama menjelaskan:「報告」「連絡」「相談」の3つの言葉の頭文字. Jawaban benar: A.',
                    ],
                    [
                        'question' => '仕事でトラブルが発生したとき、なぜすぐに報告しなければなりませんか。',
                        'options' => ['A' => '上司に怒られるのを避けるため', 'B' => '同僚に自分の仕事を代わってもらうため', 'C' => '後回しにすると問題が大きくなって迷惑をかけるため', 'D' => '報告書を書く時間がなくなるため'],
                        'correct_option' => 'C',
                        'explanation' => 'Teks menegaskan:「後回しにすると、問題が大きくなって会社全体に迷惑をかけてしまうからです」. Jawaban benar: C.',
                    ],
                    [
                        'question' => '「連絡」をするときに求められる姿勢はどれですか。',
                        'options' => ['A' => '自分の感情や意見を強調すること', 'B' => '推測を交えず客観的な事実を迅速に共有すること', 'C' => '関係者の一部だけに秘密で伝えること', 'D' => '急ぎの用件でも文書だけで伝えること'],
                        'correct_option' => 'B',
                        'explanation' => 'Teks menyatakan:「自分の意見や推測を入れず、客観的な事実を迅速に共有することが求められます」. Jawaban benar: B.',
                    ],
                    [
                        'question' => '仕事で判断に迷ったときはどうすべきだと書かれていますか。',
                        'options' => ['A' => '誰にも言わずに自分で適当に決める', 'B' => '仕事が終わるまで何日も放置する', 'C' => '他の人のミスを探して責任を転嫁する', 'D' => '一人で抱え込まずに早めに上司や同僚に意見を聞く'],
                        'correct_option' => 'D',
                        'explanation' => 'Bagian 相談 menyebutkan:「一人で抱え込まずに早めに相談することで、ミスを防ぎ、より良い解決策を見つけることができます」. Jawaban benar: D.',
                    ],
                    [
                        'question' => '「報・連・相」を徹底することで得られるメリットは何ですか。',
                        'options' => ['A' => '職場の信頼関係が深まりチームの成果につながる', 'B' => '仕事の時間が半分に短縮される', 'C' => '会社に行かなくてもよくなり在宅勤務ができる', 'D' => '上司と一切会話をしなくて済むようになる'],
                        'correct_option' => 'A',
                        'explanation' => 'Kalimat penutup menyatakan:「職場の信頼関係が深まり、チーム全体の成果につながるのです」. Jawaban benar: A.',
                    ],
                ],
            ],
        ];
    }

    private function getCheckpointQuestionsData(array $audioPool): array
    {
        return [
            // --- Sesi 1: Kosakata & Kanji (vocabulary_kanji) Q1 - Q5 ---
            [
                'session' => 'vocabulary_kanji',
                'question' => '「毎朝、近くの公園を散歩します。」の下線部「散歩」の読み方はどれですか。',
                'options' => ['A' => 'さんぽ', 'B' => 'さんほ', 'C' => 'ざんぽ', 'D' => 'しんぽ'],
                'correct_option' => 'A',
                'explanation' => '「散歩」の正しい読み仮名は「さんぽ」です。「散（さん）」＋「歩（ぽ）」。Jawaban benar: A.',
            ],
            [
                'session' => 'vocabulary_kanji',
                'question' => '「あそこに新しい【たてもの】ができました。」の【たてもの】の漢字はどれですか。',
                'options' => ['A' => '建物', 'B' => '建者', 'C' => '立物', 'D' => '造物'],
                'correct_option' => 'A',
                'explanation' => '「たてもの」は漢字で「建物」と書きます。Jawaban benar: A.',
            ],
            [
                'session' => 'vocabulary_kanji',
                'question' => '運動のあとで、のどが渇いたので水を＿＿飲みました。文に入る最も適切な言葉はどれですか。',
                'options' => ['A' => 'ごくごく', 'B' => 'すらすら', 'C' => 'ぴかぴか', 'D' => 'うろうろ'],
                'correct_option' => 'A',
                'explanation' => 'のどが渇いて勢いよく液体を飲む様子は「ごくごく」と表現します。すらすら (lancar), ぴかぴか (berkilau), うろうろ (mondar-mandir). Jawaban benar: A.',
            ],
            [
                'session' => 'vocabulary_kanji',
                'question' => '「この部屋はとても【狭い】です。」の下線部と反対の意味の言葉はどれですか。',
                'options' => ['A' => '広い', 'B' => '高い', 'C' => '明るい', 'D' => '大きい'],
                'correct_option' => 'A',
                'explanation' => '「狭い（せまい：sempit）」の対義語は「広い（ひろい：luas）」です。Jawaban benar: A.',
            ],
            [
                'session' => 'vocabulary_kanji',
                'question' => '「【集める】の使い方として最も適切なものはどれですか。」',
                'options' => [
                    'A' => '私は趣味で世界中の切手を集めています。',
                    'B' => '毎朝7時に目覚まし時計を集めます。',
                    'C' => '駅まで歩いて電車を集めました。',
                    'D' => '雨が降ってきたので傘を集めました。',
                ],
                'correct_option' => 'A',
                'explanation' => '「集める（あつめる）」は物を一か所に集約・収集する意味であり、切手などのコレクションに用いるAが自然です。Jawaban benar: A.',
            ],

            // --- Sesi 2: Tata Bahasa (grammar) Q6 - Q10 ---
            [
                'session' => 'grammar',
                'question' => '先週の日曜日、友達＿＿一緒に京都へ行きました。空欄に入る助詞はどれですか。',
                'options' => ['A' => 'と', 'B' => 'に', 'C' => 'を', 'D' => 'で'],
                'correct_option' => 'A',
                'explanation' => '動作を一緒に行う相手を示す助詞は「と」です。「友達と一緒に（bersama teman）」. Jawaban benar: A.',
            ],
            [
                'session' => 'grammar',
                'question' => '部屋の空気を涼しく＿＿ために、窓を開けて換気扇を回しました。空欄に入る動詞の形はどれですか。',
                'options' => ['A' => 'する', 'B' => 'して', 'C' => 'した', 'D' => 'しよう'],
                'correct_option' => 'A',
                'explanation' => '目的を表す「〜ために」の前には動詞の辞書形（原形）が接続します。「涼しくする＋ために」. Jawaban benar: A.',
            ],
            [
                'session' => 'grammar',
                'question' => '昨晩はとても疲れていたので、お風呂にも入らずに【 ＿＿　＿＿　★　＿＿ 】寝てしまった。★に入るものはどれですか。',
                'options' => ['A' => 'そのまま', 'B' => 'ベッドに', 'C' => '倒れ込むように', 'D' => 'すぐに'],
                'correct_option' => 'A',
                'explanation' => '正しい語順は「ベッドに (B) 倒れ込むように (C) そのまま (A) すぐに (D)」または「そのままベッドに倒れ込むように寝てしまった」。★の位置に入る自然な副詞句は「そのまま」です。Jawaban benar: A.',
            ],
            [
                'session' => 'grammar',
                'question' => '重い荷物を持っていたら、親切な駅員さんが手伝って＿＿。空欄に入る最も適切なものはどれですか。',
                'options' => ['A' => 'くれました', 'B' => 'あげました', 'C' => 'もらいました', 'D' => 'やりました'],
                'correct_option' => 'A',
                'explanation' => '他者が私（話し手）に対して親切な行為をしてくれた場合は「〜てくれました」を用います。Jawaban benar: A.',
            ],
            [
                'session' => 'grammar',
                'question' => '課長、明日の午後からの打ち合わせ資料について、私からご説明＿＿。空欄に入る敬語表現はどれですか。',
                'options' => ['A' => 'いたします', 'B' => 'なさいます', 'C' => 'になられます', 'D' => 'くださいます'],
                'correct_option' => 'A',
                'explanation' => '自分の動作を相手（上司）に対してへりくだって述べる謙譲語表現は「お／ご〜いたします」です。「ご説明いたします」. Jawaban benar: A.',
            ],

            // --- Sesi 3: Reading / Dokkai (reading) Q11 - Q15 ---
            [
                'session' => 'reading',
                'question' => 'このメモを書いた人が最も伝えたいことは何ですか。',
                'reading_passage' => "田中さんへ\nお疲れ様です。明日の朝一番（9時）に来客予定のABC商事の山田様ですが、台風による交通機関の乱れを考慮し、来社時間が11時に変更となりました。\nつきましては、9時に予約していた第1応接室を一度キャンセルし、11時から12時まで第2会議室を押さえ直していただけますでしょうか。\nよろしくお願いいたします。\n（鈴木より）",
                'options' => [
                    'A' => '会議室の予約時間を11時から12時に変更してほしいこと',
                    'B' => '明日の会議を完全に中止してほしいこと',
                    'C' => 'ABC商事へ直接謝罪に行ってほしいこと',
                    'D' => '鈴木さんの代わりに会議に出席してほしいこと',
                ],
                'correct_option' => 'A',
                'explanation' => 'メモの目的は、顧客の来社時間が11時に変更されたことに伴い、会議室の予約を11時〜12時に変更してもらう依頼です。Jawaban benar: A.',
            ],
            [
                'session' => 'reading',
                'question' => 'このお知らせによると、図書館の休館日はいつですか。',
                'reading_passage' => "【中央図書館より休館のお知らせ】\n館内蔵書点検および照明LED化工事のため、来週月曜日（10日）から水曜日（12日）までの3日間は全館休館となります。\n休館中の本の返却につきましては、正面入口横の「返却ポスト」をご利用ください。\nただし、CD・DVDなどの視聴覚資料は破損の恐れがあるため返却ポストには入れず、木曜日以降にカウンターへ直接お持ちください。",
                'options' => [
                    'A' => '来週の月曜日から水曜日までの3日間',
                    'B' => '毎週土曜日と日曜日',
                    'C' => '来週の木曜日と金曜日',
                    'D' => '今月の最終日のみ',
                ],
                'correct_option' => 'A',
                'explanation' => '「来週月曜日（10日）から水曜日（12日）までの3日間は全館休館となります」と明記されています。Jawaban benar: A.',
            ],
            [
                'session' => 'reading',
                'question' => '休館中にCDやDVDを返却したい場合、利用者はどうしなければなりませんか。',
                'reading_passage' => "【中央図書館より休館のお知らせ】\n館内蔵書点検および照明LED化工事のため、来週月曜日（10日）から水曜日（12日）までの3日間は全館休館となります。\n休館中の本の返却につきましては、正面入口横の「返却ポスト」をご利用ください。\nただし、CD・DVDなどの視聴覚資料は破損の恐れがあるため返却ポストには入れず、木曜日以降にカウンターへ直接お持ちください。",
                'options' => [
                    'A' => '木曜日の開館以降に受付カウンターへ直接返却する',
                    'B' => '返却ポストにそのまま入れる',
                    'C' => '郵送で図書館へ送る',
                    'D' => '返却せずにそのまま保管しておく',
                ],
                'correct_option' => 'A',
                'explanation' => '「CD・DVDなどの視聴覚資料は破損の恐れがあるため返却ポストには入れず、木曜日以降にカウンターへ直接お持ちください」とあります。Jawaban benar: A.',
            ],
            [
                'session' => 'reading',
                'question' => '筆者が健康維持のために毎日続けていることは何ですか。',
                'reading_passage' => "私は以前、休日は家でゲームばかりして運動を全くしていませんでした。しかし去年の健康診断で運動不足を指摘されてから、毎日一つ手前の駅で降りて、家まで20分間歩く習慣を始めました。\n最初は足が痛くなりましたが、1か月もすると体が軽くなり、夜もぐっすり眠れるようになりました。エレベーターを使わずに階段を使うことも心がけています。無理な運動よりも、毎日の小さな積み重ねが大切だと実感しています。",
                'options' => [
                    'A' => '一駅手前で降りて家まで20分歩くこと',
                    'B' => '毎朝ジムに通って筋力トレーニングをすること',
                    'C' => '休日中ずっとゲームをして過ごすこと',
                    'D' => 'エレベーターだけを使って階段を避けること',
                ],
                'correct_option' => 'A',
                'explanation' => '「毎日一つ手前の駅で降りて、家まで20分間歩く習慣を始めました」と明確に述べています。Jawaban benar: A.',
            ],
            [
                'session' => 'reading',
                'question' => '電車が遅延したとき、学生が学校へ提出すべき書類は何ですか。',
                'reading_passage' => "学生の皆様へ\n台風や大雪、車両点検等により公共交通機関が遅延した場合、遅刻扱いとしないための手続きが必要です。\n改札口を出る際に駅員から「遅延証明書」を受け取るか、各鉄道会社の公式ウェブサイトから発行されるWeb遅延証明書を印刷し、当日中に学生課窓口へ提出してください。\n証明書の提出がない遅刻は通常の欠席・遅刻扱いとなりますのでご注意ください。",
                'options' => [
                    'A' => '鉄道会社が発行する遅延証明書',
                    'B' => '病院の診断書',
                    'C' => '保護者からの手紙',
                    'D' => '購入した切手や定期券の領収書',
                ],
                'correct_option' => 'A',
                'explanation' => '「駅員から『遅延証明書』を受け取るか…Web遅延証明書を印刷し、当日中に学生課窓口へ提出してください」とあります。Jawaban benar: A.',
            ],

            // --- Sesi 4: Audio / Choukai (audio) Q16 - Q20 ---
            [
                'session' => 'audio',
                'audio_url' => $audioPool[0],
                'question' => "男の人と女の人が話しています。女の人はこれからどこへ向かいますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '駅の売店', 'B' => '2番線のホーム', 'C' => '中央改札口', 'D' => 'タクシー乗り場'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n男：新幹線の時間、あと10分だよ。\n女：お弁当はもう買ったから、急いで2番線のホームへ行きましょう。\n男：そうだね、階段を上がろう。\n\n【解説】\nSi wanita mengajak segera menuju peron jalur 2 (2番線のホーム). Jawaban benar: B.",
            ],
            [
                'session' => 'audio',
                'audio_url' => $audioPool[1],
                'question' => "店員とお客さんが話しています。合計金額はいくらになりましたか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '1,500円', 'B' => '2,200円', 'C' => '2,800円', 'D' => '3,000円'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n店員：こちらのノートが3冊で600円、ペンが4本で800円、辞書が1冊800円でございます。\n客：合計でお願いします。\n店員：はい、合わせて2,200円になります。\n\n【解説】\n600 + 800 + 800 = 2.200 yen (2,200円). Jawaban benar: B.",
            ],
            [
                'session' => 'audio',
                'audio_url' => $audioPool[2],
                'question' => "病院の受付で話しています。患者は何番の部屋へ行かなければなりませんか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '1番の診察室', 'B' => '3番の処置室', 'C' => '5番の検査室', 'D' => '2階の薬局'],
                'correct_option' => 'C',
                'explanation' => "【スクリプト】\n受付：佐藤様ですね。本日はまず血液検査がございますので、廊下をまっすぐ進んで右側の5番の検査室へお入りください。\n患者：わかりました、5番ですね。\n\n【解説】\nPetugas mengarahkan pasien terlebih dahulu ke ruang pemeriksaan nomor 5 (5番の検査室). Jawaban benar: C.",
            ],
            [
                'session' => 'audio',
                'audio_url' => $audioPool[3],
                'question' => "男の人と女の人が道で話しています。郵便局はどこにありますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '交番の角を曲がってすぐ隣', 'B' => '銀行の向かい側', 'C' => 'コンビニの2階', 'D' => '公園の中'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n男：すみません、この近くに郵便局はありますか。\n女：はい、この道をまっすぐ行くと大きな銀行があります。そのちょうど向かい側ですよ。\n男：ありがとうございます。\n\n【解説】\nKantor pos berada tepat di seberang bank besar (銀行の向かい側). Jawaban benar: B.",
            ],
            [
                'session' => 'audio',
                'audio_url' => $audioPool[4],
                'question' => "二人が週末の旅行について話しています。二人は土曜日の朝何時に出発しますか。\n音声を聞いて、最も適切な答えを一つ選びなさい。",
                'options' => ['A' => '朝6時00分', 'B' => '朝7時00分', 'C' => '朝8時00分', 'D' => '朝9時00分'],
                'correct_option' => 'B',
                'explanation' => "【スクリプト】\n女：土曜日は道路が混みそうだから、朝早く出ない？\n男：そうだね。6時は少し早すぎるから、7時に車で迎えに行くよ。\n女：うん、7時ならちょうどいいわ。\n\n【解説】\nMereka sepakat berangkat pukul 07:00 pagi (朝7時00分). Jawaban benar: B.",
            ],
        ];
    }
}
