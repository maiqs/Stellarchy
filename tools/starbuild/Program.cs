// Stellarchy star list: Sol + the N nearest star systems from the HYG catalogue, sorted by distance.
// Adapted from ../../../star_diplomacy/tools. Usage: dotnet run -c Release -- <hyg.csv> <out.json> [count=3000] [maxPc=40]
using System.Globalization;
using System.Text;
using System.Text.Json;

var inv = CultureInfo.InvariantCulture;
string csv = args.Length > 0 ? args[0] : "../data/hygdata_v41.csv";
string outPath = args.Length > 1 ? args[1] : "../data/star_map.json";
int N = args.Length > 2 ? int.Parse(args[2]) : 100;
double maxPc = args.Length > 3 ? double.Parse(args[3], inv) : 40;   // Stellarchy: how far to read the catalogue

const double PcToLy = 3.26156;

static List<string> SplitCsv(string line)
{
    var r = new List<string>(); var sb = new StringBuilder(); bool q = false;
    foreach (var ch in line)
    {
        if (ch == '"') q = !q;
        else if (ch == ',' && !q) { r.Add(sb.ToString()); sb.Clear(); }
        else sb.Append(ch);
    }
    r.Add(sb.ToString()); return r;
}

var lines = File.ReadLines(csv).GetEnumerator(); lines.MoveNext();
var head = SplitCsv(lines.Current); int C(string n) => head.IndexOf(n);
var stars = new List<Dictionary<string, string>>();
while (lines.MoveNext())
{
    var f = SplitCsv(lines.Current);
    if (!double.TryParse(f[C("dist")], NumberStyles.Float, inv, out var d) || d > maxPc || d >= 100000) continue;
    stars.Add(head.Select((h, i) => (h, v: i < f.Count ? f[i] : "")).ToDictionary(p => p.h, p => p.v));
}

var greek = new Dictionary<string, string> { ["Alp"] = "Alpha", ["Bet"] = "Beta", ["Gam"] = "Gamma", ["Del"] = "Delta", ["Eps"] = "Epsilon", ["Zet"] = "Zeta", ["Eta"] = "Eta", ["The"] = "Theta", ["Iot"] = "Iota", ["Kap"] = "Kappa", ["Lam"] = "Lambda", ["Mu"] = "Mu", ["Nu"] = "Nu", ["Xi"] = "Xi", ["Omi"] = "Omicron", ["Pi"] = "Pi", ["Rho"] = "Rho", ["Sig"] = "Sigma", ["Tau"] = "Tau", ["Ups"] = "Upsilon", ["Phi"] = "Phi", ["Chi"] = "Chi", ["Psi"] = "Psi", ["Ome"] = "Omega" };
var cons = new Dictionary<string, string> { ["Cen"] = "Centauri", ["Ind"] = "Indi", ["Cet"] = "Ceti", ["Eri"] = "Eridani", ["Cyg"] = "Cygni", ["Aql"] = "Aquilae", ["Pav"] = "Pavonis", ["Dra"] = "Draconis", ["Boo"] = "Bootis", ["Oph"] = "Ophiuchi", ["UMa"] = "Ursae Majoris", ["Lyr"] = "Lyrae", ["CMi"] = "Canis Minoris", ["CMa"] = "Canis Majoris", ["Peg"] = "Pegasi", ["Hyi"] = "Hydri", ["Tuc"] = "Tucanae", ["Her"] = "Herculis", ["Cas"] = "Cassiopeiae", ["Leo"] = "Leonis", ["PsA"] = "Piscis Austrini", ["Vir"] = "Virginis", ["Sco"] = "Scorpii", ["Lib"] = "Librae", ["Ari"] = "Arietis", ["Tri"] = "Trianguli", ["And"] = "Andromedae", ["Hor"] = "Horologii", ["Ret"] = "Reticuli", ["Pic"] = "Pictoris", ["Phe"] = "Phoenicis", ["Gru"] = "Gruis", ["Ser"] = "Serpentis", ["Aqr"] = "Aquarii", ["Psc"] = "Piscium", ["Tau"] = "Tauri", ["Gem"] = "Geminorum", ["UMi"] = "Ursae Minoris", ["Cep"] = "Cephei", ["Vel"] = "Velorum", ["Ara"] = "Arae", ["Lep"] = "Leporis", ["Hya"] = "Hydrae", ["Crv"] = "Corvi", ["Com"] = "Comae Berenices", ["CVn"] = "Canum Venaticorum", ["Lyn"] = "Lyncis", ["Per"] = "Persei", ["Aur"] = "Aurigae", ["Ori"] = "Orionis", ["Mon"] = "Monocerotis", ["Pup"] = "Puppis", ["Car"] = "Carinae", ["Mus"] = "Muscae", ["Cru"] = "Crucis", ["Nor"] = "Normae", ["TrA"] = "Trianguli Australis", ["Mic"] = "Microscopii", ["Sgr"] = "Sagittarii", ["Cap"] = "Capricorni", ["Scl"] = "Sculptoris", ["For"] = "Fornacis", ["Col"] = "Columbae", ["Cae"] = "Caeli", ["Dor"] = "Doradus", ["Men"] = "Mensae", ["Oct"] = "Octantis", ["Aps"] = "Apodis", ["Cha"] = "Chamaeleontis", ["Vol"] = "Volantis", ["Cir"] = "Circini", ["Lup"] = "Lupi", ["Tel"] = "Telescopii", ["CrA"] = "Coronae Australis", ["CrB"] = "Coronae Borealis", ["Sct"] = "Scuti", ["Sge"] = "Sagittae", ["Vul"] = "Vulpeculae", ["Del"] = "Delphini", ["Equ"] = "Equulei", ["Lac"] = "Lacertae", ["LMi"] = "Leonis Minoris", ["Sex"] = "Sextantis", ["Crt"] = "Crateris", ["Ant"] = "Antliae", ["Pyx"] = "Pyxidis", ["Cnc"] = "Cancri", ["Cam"] = "Camelopardalis", ["Eri "] = "Eridani" };
// common names of nearby Gliese stars that HYG leaves unnamed
var common = new Dictionary<string, string> { ["Gl 406"] = "Wolf 359", ["Gl 411"] = "Lalande 21185", ["Gl 65A"] = "Luyten 726-8", ["Gl 65"] = "Luyten 726-8", ["Gl 729"] = "Ross 154", ["Gl 905"] = "Ross 248", ["Gl 887"] = "Lacaille 9352", ["Gl 447"] = "Ross 128", ["Gl 866A"] = "EZ Aquarii", ["Gl 866"] = "EZ Aquarii", ["Gl 725A"] = "Struve 2398", ["Gl 15A"] = "Groombridge 34", ["Gl 1111"] = "DX Cancri", ["Gl 54.1"] = "YZ Ceti", ["Gl 273"] = "Luyten's Star", ["Gl 191"] = "Kapteyn's Star", ["Gl 825"] = "Lacaille 8760", ["Gl 860A"] = "Kruger 60", ["Gl 628"] = "Wolf 1061", ["Gl 35"] = "Van Maanen's Star", ["Gl 699"] = "Barnard's Star", ["Gl 551"] = "Proxima Centauri", ["Gl 380"] = "Groombridge 1618", ["Gl 412A"] = "Gliese 412", ["Gl 83.1"] = "TZ Arietis", ["Gl 285"] = "YZ Canis Minoris", ["Gl 234A"] = "Ross 614", ["Gl 905.0"] = "Ross 248", ["Gl 1061"] = "Gliese 1061", ["Gl 876"] = "Gliese 876", ["Gl 581"] = "Gliese 581", ["Gl 667A"] = "Gliese 667", ["Gl 440"] = "LP 145-141", ["Gl 768"] = "Altair" };

string StarName(Dictionary<string, string> s)
{
    var better = new Dictionary<string, string> { ["Ran"] = "Epsilon Eridani", ["Keid"] = "40 Eridani", ["Alsafi"] = "Sigma Draconis", ["Guniibuu"] = "36 Ophiuchi", ["Achird"] = "Eta Cassiopeiae", ["82 G. Eri"] = "82 Eridani", ["EZ Aqr"] = "EZ Aquarii", ["Struve 2398 A"] = "Struve 2398", ["Struve 2398 B"] = "Struve 2398 B" };
    if (s["proper"] != "") return better.GetValueOrDefault(s["proper"], s["proper"]);
    var gl = s["gl"].Trim();
    if (gl != "" && common.TryGetValue(gl, out var c)) return c;
    if (s["bayer"] != "" && greek.TryGetValue(s["bayer"].TrimEnd('-', '1', '2', '3').Split('-')[0], out var g) && cons.TryGetValue(s["con"], out var cn)) return $"{g} {cn}";
    if (s["flam"] != "" && cons.TryGetValue(s["con"], out var cn2)) return $"{s["flam"]} {cn2}";
    if (gl != "") return System.Text.RegularExpressions.Regex.Replace(gl.Replace("Gl ", "Gliese ").Replace("GJ ", "Gliese "), "(?<=[0-9])A$", "");
    if (s["hip"] != "") return "HIP " + s["hip"];
    return "HYG " + s["id"];
}
double D(Dictionary<string, string> s, string k) => double.TryParse(s[k], NumberStyles.Float, inv, out var v) ? v : 0;

// group into systems: comp_primary links companions to their primary; Proxima is listed apart but orbits Alpha Cen
var byId = stars.ToDictionary(s => s["id"]);
string SysKey(Dictionary<string, string> s)
{
    var p = s["comp_primary"]; if (p != "" && byId.ContainsKey(p)) return p;
    return s["id"];
}
var groups = stars.GroupBy(SysKey).ToList();
// merge Proxima into Alpha Centauri if they ended up separate
var systems = new List<Sys>();
foreach (var g in groups)
{
    var prim = byId.ContainsKey(g.Key) ? byId[g.Key] : g.First();
    var members = g.ToList();
    var sys = new Sys
    {
        Name = StarName(prim), X = D(prim, "x") * PcToLy, Y = D(prim, "y") * PcToLy, Z = D(prim, "z") * PcToLy,
        Dist = D(prim, "dist") * PcToLy, Stars = members.Count, Spect = prim["spect"], Con = prim["con"], Lum = members.Sum(m => D(m, "lum")),
        Members = members.Select(StarName).Distinct().ToList()
    };
    systems.Add(sys);
}
// Proxima: fold into Alpha Centauri (gravitationally bound)
var prox = systems.FirstOrDefault(s => s.Name.Contains("Proxima")); var rig = systems.FirstOrDefault(s => s.Name is "Rigil Kentaurus" or "Alpha Centauri" or "Toliman");
if (prox != null && rig != null && prox != rig) { rig.Stars += prox.Stars; rig.Members.AddRange(prox.Members); systems.Remove(prox); }
if (rig != null) rig.Name = "Alpha Centauri";
// well-known neighbours HYG lacks (brown dwarfs and faint red dwarfs): name, RA hours, Dec degrees, distance pc, stars, spectral type
foreach (var (nm, ra, dec, pc, st, sp) in new[] {
    ("Luhman 16", 10.8219, -53.3194, 1.996, 2, "L7.5+T0.5"),
    ("WISE 0855-0714", 8.9197, -7.2450, 2.28, 1, "Y4"),
    ("Teegarden's Star", 2.8836, 16.8814, 3.832, 1, "M7.0V"),
    ("SCR 1845-6357", 18.7515, -63.9633, 4.0, 2, "M8.5V+T6") })
{
    double r = ra * Math.PI / 12, dd = dec * Math.PI / 180;
    systems.Add(new Sys { Name = nm, X = pc * Math.Cos(dd) * Math.Cos(r) * PcToLy, Y = pc * Math.Cos(dd) * Math.Sin(r) * PcToLy, Z = pc * Math.Sin(dd) * PcToLy, Dist = pc * PcToLy, Stars = st, Spect = sp, Lum = 0, Members = new() { nm + " (added: not in HYG)" } });
}
var sol = systems.First(s => s.Name == "Sol"); sol.Dist = 0;
var chosen = systems.Where(s => s != sol).OrderBy(s => s.Dist).Take(N).Prepend(sol).ToList();
// unique names
foreach (var dup in chosen.GroupBy(s => s.Name).Where(g => g.Count() > 1)) { int k = 1; foreach (var s in dup.Skip(1)) s.Name += $" ({(char)('B' + k++ - 1)})"; }
for (int i = 0; i < chosen.Count; i++) chosen[i].Idx = i;
// Stellarchy: write the sorted systems only; lanes and regions are built in shared/mapgen.js for each map size
{
    var sysOut = new { source = "HYG Database v4.1 by David Nash (astronexus), CC BY-SA 4.0. Coordinates: equatorial x/y/z in light years, Sol at origin. Sorted by distance from Sol.", systems = chosen.Select(s => new { name = s.Name, x = Math.Round(s.X, 3), y = Math.Round(s.Y, 3), z = Math.Round(s.Z, 3), distLy = Math.Round(s.Dist, 2), stars = s.Stars, spect = s.Spect, lum = Math.Round(s.Lum, 5), con = s.Con, members = s.Members.Count > 1 ? s.Members : null }) };
    File.WriteAllText(outPath, JsonSerializer.Serialize(sysOut, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull }));
    Console.WriteLine($"wrote {outPath}: {chosen.Count} systems, farthest {chosen.Max(s => s.Dist):F1} ly");
    return;
}
class Sys { public int Idx; public string Name = "", Spect = "", Con = ""; public int Cont = -1; public double X, Y, Z, Dist, Lum; public int Stars; public bool SC; public List<string> Members = new(); }
