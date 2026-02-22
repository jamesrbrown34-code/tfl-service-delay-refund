using Microsoft.Data.Sqlite;
using TflDelayRefund.Api.Models;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Sqlite")
    ?? "Data Source=../../data/tfl-delay-refund.db";

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

Directory.CreateDirectory(Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../data")));
ApplyMigrations(connectionString);

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/journeys", () =>
{
    using var connection = new SqliteConnection(connectionString);
    connection.Open();

    using var command = connection.CreateCommand();
    command.CommandText = @"
        SELECT id, oyster_card_id, start_station, end_station, started_at_utc, ended_at_utc, fare, raw_source
        FROM journeys
        ORDER BY started_at_utc DESC
        LIMIT 500;";

    using var reader = command.ExecuteReader();
    var results = new List<JourneyRecord>();
    while (reader.Read())
    {
        results.Add(new JourneyRecord(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            DateTimeOffset.Parse(reader.GetString(4)),
            DateTimeOffset.Parse(reader.GetString(5)),
            Convert.ToDecimal(reader.GetDouble(6)),
            reader.GetString(7)
        ));
    }

    return Results.Ok(results);
});

app.MapPost("/journeys/import", (IReadOnlyList<JourneyRecord> journeys) =>
{
    using var connection = new SqliteConnection(connectionString);
    connection.Open();
    using var transaction = connection.BeginTransaction();

    foreach (var journey in journeys)
    {
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT OR REPLACE INTO journeys
                (id, oyster_card_id, start_station, end_station, started_at_utc, ended_at_utc, fare, raw_source)
            VALUES
                ($id, $oysterCardId, $startStation, $endStation, $startedAtUtc, $endedAtUtc, $fare, $rawSource);";

        command.Parameters.AddWithValue("$id", journey.Id);
        command.Parameters.AddWithValue("$oysterCardId", journey.OysterCardId);
        command.Parameters.AddWithValue("$startStation", journey.StartStation);
        command.Parameters.AddWithValue("$endStation", journey.EndStation);
        command.Parameters.AddWithValue("$startedAtUtc", journey.StartedAt.UtcDateTime.ToString("O"));
        command.Parameters.AddWithValue("$endedAtUtc", journey.EndedAt.UtcDateTime.ToString("O"));
        command.Parameters.AddWithValue("$fare", journey.Fare);
        command.Parameters.AddWithValue("$rawSource", journey.RawSource);

        command.ExecuteNonQuery();
    }

    transaction.Commit();
    return Results.Accepted($"/journeys", new { imported = journeys.Count });
});

app.Run();

static void ApplyMigrations(string connectionString)
{
    using var connection = new SqliteConnection(connectionString);
    connection.Open();

    var migrationSqlPath = Path.Combine(AppContext.BaseDirectory, "Migrations", "001_init.sql");
    if (!File.Exists(migrationSqlPath))
    {
        migrationSqlPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../apps/api/Migrations/001_init.sql"));
    }

    var migrationSql = File.ReadAllText(migrationSqlPath);
    using var command = connection.CreateCommand();
    command.CommandText = migrationSql;
    command.ExecuteNonQuery();
}
