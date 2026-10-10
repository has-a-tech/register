// DNSControl configuration for has-a.tech.
// Every file in domains/ becomes DNS records in Cloudflare.
// Docs: https://docs.dnscontrol.org/

var DOMAIN = "has-a.tech";
var REG_NONE = NewRegistrar("none");
var DSP_CLOUDFLARE = NewDnsProvider("cloudflare");

function fqdn(host) {
  return host.replace(/\.$/, "") + ".";
}

var files = glob("./domains/", false, ".json");
if (files.length === 0) {
  // Safety net: an empty list would make DNSControl delete every record.
  throw new Error("No domain files found; refusing to continue.");
}

var records = [];
for (var i = 0; i < files.length; i++) {
  var name = files[i].split("/").pop().replace(/\.json$/, "");
  var data = require(files[i]);
  var r = data.records;
  var proxy = data.proxied === true ? CF_PROXY_ON : CF_PROXY_OFF;

  if (r.CNAME) {
    records.push(CNAME(name, fqdn(r.CNAME), proxy));
  }
  if (r.A) {
    for (var a = 0; a < r.A.length; a++) records.push(A(name, r.A[a], proxy));
  }
  if (r.AAAA) {
    for (var b = 0; b < r.AAAA.length; b++) records.push(AAAA(name, r.AAAA[b], proxy));
  }
  if (r.TXT) {
    var txt = typeof r.TXT === "string" ? [r.TXT] : r.TXT;
    for (var t = 0; t < txt.length; t++) records.push(TXT(name, txt[t]));
  }
}

D(DOMAIN, REG_NONE, DnsProvider(DSP_CLOUDFLARE),
  // Records managed by hand in the Cloudflare dashboard. DNSControl will never
  // create, change or delete these, so your homepage and email keep working.
  IGNORE("@"),             // website (Cloudflare Worker) + Email Routing MX/SPF records
  IGNORE("www"),           // website
  IGNORE("send"),          // Resend: outgoing verification email (MX + SPF)
  IGNORE("_dmarc"),        // email policy
  IGNORE("*._domainkey"),  // Email Routing and Resend DKIM keys
  records
);
