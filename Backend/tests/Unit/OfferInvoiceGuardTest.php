<?php

namespace Tests\Unit;

use App\Http\Controllers\ProgramOfferController;
use App\Models\Invoice;
use App\Models\ProgramOffer;
use App\Models\User;
use App\Services\AffiliateService;
use App\Services\InvoiceWorkflowService;
use App\Services\NotificationService;
use Illuminate\Container\Container;
use Illuminate\Contracts\Routing\ResponseFactory;
use Illuminate\Database\ConnectionResolver;
use Illuminate\Database\DatabaseManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Schema\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\Validator;
use Illuminate\Translation\ArrayLoader;
use Illuminate\Translation\Translator;
use Illuminate\Validation\Factory;
use Illuminate\Validation\ValidationException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class OfferInvoiceGuardTest extends TestCase
{
    private Container $previousContainer;

    private mixed $previousFacade;

    private mixed $previousResolver;

    private mixed $previousNow;

    private PostgresConnection $connection;

    protected function setUp(): void
    {
        parent::setUp();
        $this->previousContainer = Container::getInstance();
        $this->previousFacade = Facade::getFacadeApplication();
        $this->previousResolver = Model::getConnectionResolver();
        $this->previousNow = Carbon::getTestNow();
        Carbon::setTestNow('2026-10-27 12:00:00');
        $container = new class extends Container
        {
            public function abort($code, $message = '', array $headers = []): never
            {
                throw new HttpException($code, $message, null, $headers);
            }
        };
        Container::setInstance($container);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication($container);
        Validator::swap(new Factory(new Translator(new ArrayLoader, 'en'), $container));
        $this->connection = Mockery::mock(PostgresConnection::class)->makePartial();
        $this->connection->useDefaultQueryGrammar();
        $this->connection->useDefaultPostProcessor();
        $resolver = new ConnectionResolver(['test' => $this->connection]);
        $resolver->setDefaultConnection('test');
        Model::setConnectionResolver($resolver);
        $database = Mockery::mock(DatabaseManager::class);
        $database->shouldReceive('transaction')->andReturnUsing(fn ($callback) => $callback());
        DB::swap($database);
    }

    protected function tearDown(): void
    {
        try {
            Mockery::close();
        } finally {
            if ($this->previousResolver) {
                Model::setConnectionResolver($this->previousResolver);
            } else {
                Model::unsetConnectionResolver();
            }
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->previousFacade);
            Container::setInstance($this->previousContainer);
            Carbon::setTestNow($this->previousNow);
            parent::tearDown();
        }
    }

    public static function unsellableOffers(): array
    {
        return [
            'inactive program' => ['inactive', 'active', 100],
            'inactive offer' => ['active', 'inactive', 100],
            'unknown price' => ['active', 'active', null],
        ];
    }

    #[DataProvider('unsellableOffers')]
    public function test_create_rejects_unsellable_locked_offer_without_insert(string $programStatus, string $offerStatus, ?int $price): void
    {
        $this->lockedRows($programStatus, $offerStatus, $price);
        $this->connection->shouldNotReceive('selectFromWriteConnection');
        try {
            (new InvoiceWorkflowService)->create((new User)->forceFill(['id' => 7]), (new ProgramOffer)->forceFill(['id' => 8]));
            $this->fail('Unsellable offer accepted.');
        } catch (ValidationException $error) {
            $this->assertSame(['program_offer_id' => ['Offer is not currently sellable.']], $error->errors());
        }
    }

    public function test_create_rechecks_student_status_from_locked_row(): void
    {
        foreach ([['admin', 'active'], ['student', 'inactive']] as [$role, $status]) {
            $this->select('users', 7, ['id' => 7, 'role' => $role, 'account_status' => $status]);
            try {
                (new InvoiceWorkflowService)->create((new User)->forceFill(['id' => 7, 'role' => 'student', 'account_status' => 'active']), new ProgramOffer);
                $this->fail('Invalid student accepted.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('user_id', $error->errors());
            }
        }
    }

    public static function membershipCases(): array
    {
        return ['new purchase' => [null, false], 'N5' => ['n5', true], 'N4' => ['n4', true], 'N3' => ['n3', true], 'N2' => ['n2', true], 'N1' => ['n1', true], 'different program or plan' => ['n5', false], 'other program' => ['ssw-food', false]];
    }

    #[DataProvider('membershipCases')]
    public function test_create_uses_locked_server_price_and_membership_identity(?string $code, bool $owned): void
    {
        $this->lockedRows('active', 'active', 101, $code);
        if (in_array($code, ['n5', 'n4', 'n3', 'n2', 'n1'], true)) {
            $this->connection->shouldReceive('select')->once()->withArgs(function ($sql, $bindings) {
                return str_contains($sql, 'from "access_grants"') && str_contains($sql, 'for update') && $bindings === [7, 9, 'lms', 'active'];
            })->andReturn($owned ? [(object) ['id' => 20]] : []);
        }
        $this->connection->shouldReceive('select')->once()
            ->withArgs(fn ($sql, $bindings) => str_contains($sql, 'from "promotions"') && str_contains($sql, '(8)') && $bindings === [])
            ->andReturn([(object) ['id' => 3, 'program_offer_id' => 8, 'status' => 'active', 'discount_percent' => 50, 'starts_at' => '2026-10-27', 'ends_at' => '2026-10-27']]);
        $schema = Mockery::mock(Builder::class);
        $schema->shouldReceive('getColumnListing')->with('invoices')->andReturn([
            'reference', 'user_id', 'program_offer_id', 'program_id', 'plan_code', 'status',
            'base_price', 'discount_percent', 'discount_amount', 'total_price', 'currency',
            'duration_months', 'due_date', 'note', 'renewal_grant_id',
        ]);
        $this->connection->shouldReceive('getSchemaBuilder')->andReturn($schema);
        $saved = [];
        $this->connection->shouldReceive('selectFromWriteConnection')->once()
            ->withArgs(function ($sql, $bindings) use (&$saved, $owned) {
                $this->assertStringContainsString('insert into "invoices"', $sql);
                preg_match('/\((.*?)\) values/', $sql, $columns);
                $keys = array_map(fn ($column) => trim($column, ' "'), explode(',', $columns[1]));
                $saved = array_combine($keys, $bindings);
                foreach (['user_id' => 7, 'program_offer_id' => 8, 'program_id' => 9, 'plan_code' => 'lms', 'status' => 'draft', 'base_price' => 101, 'discount_percent' => 50.0, 'discount_amount' => 51, 'total_price' => 50, 'currency' => 'IDR', 'duration_months' => 6] as $key => $value) {
                    $this->assertSame($value, $saved[$key], $key);
                }

                $this->assertSame($owned ? 20 : null, $saved['renewal_grant_id']);
                return true;
            })->andReturn([(object) ['id' => 10]]);
        $this->connection->shouldReceive('select')->once()
            ->withArgs(fn ($sql, $bindings) => str_contains($sql, 'from "invoices"') && $bindings === [10])
            ->andReturnUsing(function () use (&$saved) {
                return [(object) ['id' => 10, ...$saved]];
            });
        $affiliate = Mockery::mock(AffiliateService::class);
        $affiliate->shouldReceive('referral')->once()->with(Mockery::type(Invoice::class), null);
        Container::getInstance()->instance(AffiliateService::class, $affiliate);
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('invoiceReminder')->once()->with(Mockery::type(User::class), Mockery::type(Invoice::class));
        Container::getInstance()->instance(NotificationService::class, $notifications);
        $invoice = (new InvoiceWorkflowService)->create(
            (new User)->forceFill(['id' => 7]),
            (new ProgramOffer)->forceFill(['id' => 8, 'base_price' => 1, 'program_id' => 999]),
            ['base_price' => 0, 'total_price' => 0, 'discount_percent' => 100, 'program_id' => 999, 'plan_code' => 'sensei'],
        );
        $this->assertSame(50, $invoice->total_price);
        $this->assertSame(9, $invoice->program_id);
    }

    public function test_controller_status_patch_locks_offer_and_never_updates_program(): void
    {
        $request = Mockery::mock(Request::class)->makePartial();
        $request->setUserResolver(fn () => (new User)->forceFill(['role' => 'admin', 'account_status' => 'active']));
        $request->shouldReceive('validate')->once()->andReturnUsing(function ($rules) {
            $this->assertSame(['sometimes', 'required', 'in:active,inactive'], $rules['status']);
            $this->assertSame(['prohibited'], $rules['program_id']);

            return Validator::make(['status' => 'inactive'], $rules)->validate();
        });
        $this->select('program_offers', 8, ['id' => 8, 'program_id' => 9, 'status' => 'active']);
        $this->connection->shouldReceive('update')->once()->withArgs(function ($sql, $bindings) {
            return str_starts_with($sql, 'update "program_offers"') && in_array('inactive', $bindings, true) && end($bindings) === 8;
        })->andReturn(1);
        $this->connection->shouldReceive('select')->once()
            ->withArgs(fn ($sql, $bindings) => str_contains($sql, 'from "program_offers"') && ! str_contains($sql, 'for update') && $bindings === [8])
            ->andReturn([(object) ['id' => 8, 'program_id' => 9, 'status' => 'inactive']]);
        $responses = Mockery::mock(ResponseFactory::class);
        $responses->shouldReceive('json')->once()->andReturnUsing(fn ($data) => new JsonResponse($data));
        Container::getInstance()->instance(ResponseFactory::class, $responses);
        $offer = (new ProgramOffer)->forceFill(['id' => 8]);
        $offer->exists = true;
        $response = (new ProgramOfferController)->update($request, $offer);
        $this->assertSame('inactive', $response->getData(true)['data']['status']);
        $this->assertSame(9, $response->getData(true)['data']['program_id']);
    }

    public function test_pending_and_failed_invoices_cannot_activate_or_extend_access(): void
    {
        foreach (['draft', 'awaiting_payment', 'paid', 'failed', 'cancelled'] as $status) {
            $this->select('invoices', 10, ['id' => 10, 'user_id' => 7, 'status' => $status]);
            $this->select('users', 1, ['id' => 1, 'role' => 'admin', 'account_status' => 'active']);
            try {
                (new InvoiceWorkflowService)->transition((new Invoice)->forceFill(['id' => 10]), 'active', (new User)->forceFill(['id' => 1]));
                $this->fail('Unverified invoice activated.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('status', $error->errors());
            }
        }
    }

    public function test_repeat_activation_returns_existing_invoice_without_new_grant(): void
    {
        $this->select('invoices', 10, ['id' => 10, 'user_id' => 7, 'status' => 'active']);
        $this->select('users', 1, ['id' => 1, 'role' => 'admin', 'account_status' => 'active']);
        $invoice = (new InvoiceWorkflowService)->transition((new Invoice)->forceFill(['id' => 10]), 'active', (new User)->forceFill(['id' => 1]));
        $this->assertSame('active', $invoice->status);
    }

    public function test_foreign_invoice_and_student_activation_are_rejected(): void
    {
        foreach ([8 => 404, 7 => 403] as $owner => $expected) {
            $this->select('invoices', 10, ['id' => 10, 'user_id' => $owner, 'status' => 'verified']);
            $this->select('users', 7, ['id' => 7, 'role' => 'student', 'account_status' => 'active']);
            try {
                (new InvoiceWorkflowService)->transition((new Invoice)->forceFill(['id' => 10]), 'active', (new User)->forceFill(['id' => 7]));
                $this->fail('Student activation accepted.');
            } catch (HttpException $error) {
                $this->assertSame($expected, $error->getStatusCode());
            }
        }
    }

    public static function renewalDates(): array
    {
        return [
            'active' => ['2026-12-31', '2027-02-28', 'lms'],
            'expired' => ['2026-09-30', '2026-12-26', 'lms'],
            'expires on verification' => ['2026-10-27', '2026-12-27', 'sensei'],
            'already extended by another invoice' => ['2027-02-28', '2027-04-28', 'sensei'],
        ];
    }

    #[DataProvider('renewalDates')]
    public function test_renewal_preserves_history_and_uses_serialized_latest_expiry(string $expiry, string $expectedEnd, string $plan): void
    {
        $this->select('invoices', 10, ['id' => 10, 'user_id' => 7, 'program_id' => 9, 'plan_code' => $plan, 'renewal_grant_id' => 20, 'duration_months' => 2, 'status' => 'verified', 'verified_at' => '2026-10-27 12:00:00']);
        $this->select('users', 1, ['id' => 1, 'role' => 'admin', 'account_status' => 'active']);
        $this->select('users', 7, ['id' => 7, 'role' => 'student', 'account_status' => 'active']);
        $grant = ['id' => 20, 'user_id' => 7, 'program_id' => 9, 'plan_code' => $plan, 'status' => 'active', 'starts_at' => '2026-01-01', 'ends_at' => $expiry];
        $this->select('access_grants', 20, $grant);
        $this->connection->shouldReceive('select')->once()->withArgs(function ($sql, $bindings) use ($plan) {
            return str_contains($sql, 'from "access_grants"') && str_contains($sql, 'for update') && str_contains($sql, 'order by "ends_at" desc') && $bindings === [7, 9, $plan, 'active'];
        })->andReturn([(object) $grant]);
        $schema = Mockery::mock(Builder::class);
        $schema->shouldReceive('getColumnListing')->andReturn(['source_invoice_id', 'user_id', 'program_id', 'plan_code', 'status', 'starts_at', 'ends_at']);
        $this->connection->shouldReceive('getSchemaBuilder')->andReturn($schema);
        $this->connection->shouldReceive('selectFromWriteConnection')->once()->withArgs(function ($sql, $bindings) use ($expectedEnd, $plan) {
            $this->assertStringContainsString('insert into "access_grants"', $sql);
            preg_match('/\((.*?)\) values/', $sql, $columns);
            $row = array_combine(array_map(fn ($key) => trim($key, ' "'), explode(',', $columns[1])), $bindings);
            $this->assertSame(10, $row['source_invoice_id']);
            $this->assertSame(7, $row['user_id']);
            $this->assertSame(9, $row['program_id']);
            $this->assertSame($plan, $row['plan_code']);
            $this->assertSame('2026-10-27', substr($row['starts_at'], 0, 10));
            $this->assertSame($expectedEnd, substr($row['ends_at'], 0, 10));
            return true;
        })->andReturn([(object) ['id' => 21]]);
        $this->connection->shouldReceive('update')->once()->withArgs(fn ($sql) => str_starts_with($sql, 'update "invoices"'))->andReturn(1);
        $invoice = (new InvoiceWorkflowService)->transition((new Invoice)->forceFill(['id' => 10]), 'active', (new User)->forceFill(['id' => 1]));
        $this->assertSame('active', $invoice->status);
    }

    public function test_renewal_rejects_foreign_program_or_plan_source(): void
    {
        foreach (['user_id' => 8, 'program_id' => 99, 'plan_code' => 'sensei', 'status' => 'inactive'] as $field => $value) {
            $this->select('invoices', 10, ['id' => 10, 'user_id' => 7, 'program_id' => 9, 'plan_code' => 'lms', 'renewal_grant_id' => 20, 'duration_months' => 2, 'status' => 'verified', 'verified_at' => '2026-10-27 12:00:00']);
            $this->select('users', 1, ['id' => 1, 'role' => 'admin', 'account_status' => 'active']);
            $this->select('users', 7, ['id' => 7, 'role' => 'student', 'account_status' => 'active']);
            $this->select('access_grants', 20, array_replace(['id' => 20, 'user_id' => 7, 'program_id' => 9, 'plan_code' => 'lms', 'status' => 'active'], [$field => $value]));
            try {
                (new InvoiceWorkflowService)->transition((new Invoice)->forceFill(['id' => 10]), 'active', (new User)->forceFill(['id' => 1]));
                $this->fail('Mismatched renewal accepted.');
            } catch (ValidationException $error) {
                $this->assertArrayHasKey('renewal_grant_id', $error->errors());
            }
        }
    }

    private function lockedRows(string $programStatus, string $offerStatus, ?int $price, ?string $code = null): void
    {
        $this->select('users', 7, ['id' => 7, 'role' => 'student', 'account_status' => 'active']);
        $this->select('program_offers', 8, ['id' => 8, 'program_id' => 9, 'plan_code' => 'lms', 'status' => $offerStatus, 'base_price' => $price, 'currency' => 'IDR', 'duration_months' => 6]);
        $this->select('programs', 9, ['id' => 9, 'status' => $programStatus, 'code' => $code]);
    }

    private function select(string $table, int $id, array $row): void
    {
        $this->connection->shouldReceive('select')->once()
            ->withArgs(fn ($sql, $bindings) => str_contains($sql, 'from "'.$table.'"') && str_contains($sql, 'for update') && $bindings === [$id])
            ->andReturn([(object) $row]);
    }
}
