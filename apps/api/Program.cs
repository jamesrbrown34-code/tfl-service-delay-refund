using System.Globalization;
using System.Text;
using TflDelayRefund.Api.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

var dataDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../data"));
Directory.CreateDirectory(dataDirectory);
var csvPath = Path.Combine(dataDirectory, "journeys.csv");
EnsureCsvFile(csvPath);

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/journeys", () =>
{
    var journeys = ReadJourneys(csvPath)
        .OrderByDescending(j => j.StartedAt)
        .Take(500)
        .ToList();

    return Results.Ok(journeys);
});

app.MapPost("/journeys/import", (IReadOnlyList<JourneyRecord> journeys) =>
{
    var existing = ReadJourneys(csvPath)
        .ToDictionary(j => j.Id, StringComparer.Ordinal);

    foreach (var journey in journeys)
    {
        existing[journey.Id] = journey;
    }

    WriteJourneys(csvPath, existing.Values.OrderByDescending(j => j.StartedAt));
    return Results.Accepted("/journeys", new { imported = journeys.Count });
});

app.Run();

static void EnsureCsvFile(string csvPath)
{
    if (File.Exists(csvPath))
    {
        return;
    }

    var header = "id,oysterCardId,startStation,endStation,startedAt,endedAt,fare,rawSource";
    File.WriteAllText(csvPath, header + Environment.NewLine, Encoding.UTF8);
}

static List<JourneyRecord> ReadJourneys(string csvPath)
{
    if (!File.Exists(csvPath))
    {
        return [];
    }

    var lines = File.ReadAllLines(csvPath);
    if (lines.Length <= 1)
    {
        return [];
    }

    var journeys = new List<JourneyRecord>();
    for (var i = 1; i < lines.Length; i++)
    {
        var line = lines[i];
        if (string.IsNullOrWhiteSpace(line))
        {
            continue;
        }

        var cells = ParseCsvLine(line);
        if (cells.Count < 8)
        {
            continue;
        }

        if (!DateTimeOffset.TryParse(cells[4], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var startedAt))
        {
            continue;
        }

        if (!DateTimeOffset.TryParse(cells[5], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var endedAt))
        {
            continue;
        }

        if (!decimal.TryParse(cells[6], CultureInfo.InvariantCulture, out var fare))
        {
            fare = 0;
        }

        journeys.Add(new JourneyRecord(
            cells[0],
            cells[1],
            cells[2],
            cells[3],
            startedAt,
            endedAt,
            fare,
            cells[7]));
    }

    return journeys;
}

static void WriteJourneys(string csvPath, IEnumerable<JourneyRecord> journeys)
{
    var rows = new List<string>
    {
        "id,oysterCardId,startStation,endStation,startedAt,endedAt,fare,rawSource"
    };

    rows.AddRange(journeys.Select(j => string.Join(",",
        EscapeCsv(j.Id),
        EscapeCsv(j.OysterCardId),
        EscapeCsv(j.StartStation),
        EscapeCsv(j.EndStation),
        EscapeCsv(j.StartedAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)),
        EscapeCsv(j.EndedAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)),
        EscapeCsv(j.Fare.ToString(CultureInfo.InvariantCulture)),
        EscapeCsv(j.RawSource))));

    File.WriteAllLines(csvPath, rows, Encoding.UTF8);
}

static string EscapeCsv(string value)
{
    if (!value.Contains('"') && !value.Contains(',') && !value.Contains('\n') && !value.Contains('\r'))
    {
        return value;
    }

    return $"\"{value.Replace("\"", "\"\"")}\"";
}

static List<string> ParseCsvLine(string line)
{
    var values = new List<string>();
    var sb = new StringBuilder();
    var inQuotes = false;

    for (var i = 0; i < line.Length; i++)
    {
        var c = line[i];

        if (c == '"')
        {
            if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
            {
                sb.Append('"');
                i++;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (c == ',' && !inQuotes)
        {
            values.Add(sb.ToString());
            sb.Clear();
            continue;
        }

        sb.Append(c);
    }

    values.Add(sb.ToString());
    return values;
}
