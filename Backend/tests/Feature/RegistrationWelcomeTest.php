<?php

namespace Tests\Feature;

use App\Models\AccessGrant;
use App\Models\NotificationContent;
use App\Models\Program;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\InvoiceWorkflowService;
use App\Services\NotificationService;
use Database\Seeders\ProgramOfferSeeder;
use Database\Seeders\ProgramSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class RegistrationWelcomeTest extends TestCase
{
    use DatabaseTransactions;

    private function student(): User
    {
        $user = User::create(array_diff_key(User::factory()->raw(), ['status' => true]));
        $user->forceFill(['role' => 'student', 'account_status' => 'active'])->save();

        return $user;
    }

    public function test_equivalent_whatsapp_duplicate_has_exact_error_and_no_welcome(): void
    {
        $this->student()->update(['whatsapp' => '+62 812 3456 7890']);
        foreach (['081234567890', '+62 812-3456-7890', '6281234567890'] as $phone) {
            $this->postJson('/api/auth/register', [
                'name' => 'Ayu', 'email' => 'ayu@example.test', 'whatsapp' => $phone,
                'password' => 'password123', 'password_confirmation' => 'password123',
            ])->assertUnprocessable()->assertJsonPath('errors.whatsapp_normalized.0', 'Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain.');
        }
        $this->assertSame(0, NotificationContent::where('event_key', 'welcome')->count());
        $this->postJson('/api/auth/register', [
            'name' => 'Ayu', 'email' => 'ayu@example.test', 'whatsapp' => 'not-a-number',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertUnprocessable()->assertJsonMissing(['Nomor WhatsApp sudah digunakan. Silakan gunakan nomor lain.']);
    }

    public function test_registration_and_login_persist_one_personal_general_welcome(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'Ayu Tanaka', 'email' => 'ayu@example.test', 'whatsapp' => '081234567899',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated();
        $user = User::where('email', 'ayu@example.test')->firstOrFail();
        $this->postJson('/api/auth/login', ['identity' => $user->email, 'password' => 'password123'])->assertOk();
        $welcome = NotificationContent::where('user_id', $user->id)->sole();
        $this->assertSame('Selamat Datang di HiruAcademy!', $welcome->title);
        $this->assertStringContainsString('Selamat datang, Ayu Tanaka!', $welcome->body);
        $this->assertStringNotContainsString('pemesanan', $welcome->body);
        $service = app(NotificationService::class);
        $this->assertSame([$welcome->id], $service->visible($user)->pluck('id')->all());
        $this->assertFalse($service->visible($this->student())->whereKey($welcome->id)->exists());
        $admin = $this->student();
        $admin->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin)->getJson('/api/admin/notifications/'.$welcome->id)->assertNotFound();
        $service->mark($user, (string) $welcome->id, ['read' => true]);
        $this->assertTrue($service->listing($user)[0]['read']);
    }

    public function test_pending_jlpt_exact_welcome_and_later_reminder_are_deduped(): void
    {
        $this->seed([ProgramSeeder::class, ProgramOfferSeeder::class]);
        $user = $this->student();
        $user->update(['name' => 'Ayu']);
        $offer = ProgramOffer::where('program_id', Program::where('code', 'n5')->firstOrFail()->id)->where('plan_code', 'lms')->firstOrFail();
        $invoice = app(InvoiceWorkflowService::class)->create($user, $offer);
        $service = app(NotificationService::class);
        $service->welcome($user);
        $service->welcome($user);
        $service->invoiceReminder($user, $invoice);
        $this->assertSame("Selamat datang, Ayu!\n\nSaat ini akun Anda memiliki akses Free Member.\n\nApabila Anda telah melakukan pemesanan paket pembelajaran JLPT, silakan menghubungi Admin HiruAcademy melalui WhatsApp untuk melakukan konfirmasi pembayaran.\n\nSetelah pembayaran berhasil diverifikasi, akses pembelajaran Anda akan diperbarui sesuai level dan paket yang dipilih.\n\nTerima kasih telah bergabung dengan HiruAcademy. Selamat belajar!", NotificationContent::where('user_id', $user->id)->where('event_key', 'welcome')->sole()->body);
        $this->assertSame(2, NotificationContent::where('user_id', $user->id)->count());
        $this->assertSame(0, AccessGrant::where('user_id', $user->id)->count());
        $later = $this->student();
        $service->welcome($later);
        $original = NotificationContent::where('user_id', $later->id)->sole()->body;
        $laterInvoice = app(InvoiceWorkflowService::class)->create($later, $offer);
        $service->invoiceReminder($later, $laterInvoice);
        $service->welcome($later);
        $this->assertSame(2, NotificationContent::where('user_id', $later->id)->count());
        $this->assertSame($original, NotificationContent::where('user_id', $later->id)->where('event_key', 'welcome')->sole()->body);
        $paid = $this->student();
        AccessGrant::create(['user_id' => $paid->id, 'program_id' => $offer->program_id, 'plan_code' => 'lms', 'status' => 'active', 'starts_at' => today(), 'ends_at' => today()->addMonth()]);
        $service->welcome($paid);
        $this->assertStringNotContainsString('Free Member', NotificationContent::where('user_id', $paid->id)->sole()->body);
    }
}
