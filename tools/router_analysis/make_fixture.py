"""Builds a 30-row test fixture copied verbatim from the pasted results (smoke test only)."""
import pandas as pd
from pathlib import Path
rows = [
 (2,"For PCF AM or UE service failures accessing UDR, inspect the existing ServProxy discovery evidence and selected UDR endpoint.","paco-worker",1),
 (4,"For an inactive predefined rule that remains unenforced, inspect the existing PCF activation decision and resulting CP Activate Predefined Rule IE.","mco-worker",0.99042),
 (11,"Rx authorization through the PCF Diam-IWF is failing. Can you inspect the existing AAR/AAA exchanges and separate this from an SM policy SBI failure?","ims-worker",0.99977),
 (195,"Show the available AUSF_NAUSF_AUTH_AV_5G_AKA_GENERATE_AUTHDATA_REQ_FAIL_COUNT samples over the past 2 days from AUSF 5G-AKA authentication.","paco-worker",0.99995),
 (205,"Get the last 2 days of reported AUSF_NAUSF_AUTH_AV_REQ_OK_COUNT values from AUSF authentication processing.","ims-worker",0.96721),
 (209,"Show the available AUSF_NAUSF_AUTH_INVALID_MSG_FORMAT_COUNT samples over the past 2 days from AUSF authentication processing.","mco-worker",0.99449),
 (715,"I need the recorded EPDG_CURR_5G_UE_ATT_ON_PGW samples from ePDG SUBSCRIBERS for the last 2 days.","paco-worker",1),
 (771,"Bring up EPDG_IKEV2_FAILED_REASON_INTERNAL_ADDRESS_FAILURE for ePDG IKE over the last 2 days, keeping the recorded timestamps.","ims-worker",0.99337),
 (776,"Can you check security-association establishment failures caused by an unacceptable message sequence identity in ePDG IKE over the last 2 days?","mco-worker",1),
 (808,"I'm checking encrypted-data packets failing cryptographic authentication. Bring up the related ePDG IPsec measurements for the last 2 days.","mco-worker",1),
 (990,"What does the high CREATE_CHILD_SA rate alarm indicate about SeGW client activity and its configured threshold?",None,None),
 (1010,"Can you pull the last 2 days of NUM_ECA_RESP_RCVD_WITH_RC_2001 for SeGW DIAMRE equipment-identity checking?","ims-worker",1),
 (1011,"I'd like to check NUM_ECA_RESP_RCVD_WITH_RC_5003 in SeGW DIAMRE equipment-identity checking. Retrieve its readings for the last 2 days.","ims-worker",1),
 (1061,"Fetch SeGW_DL_INCOMING_THROUGHPUT from SeGW packet forwarding for the last 2 days.","paco-worker",1),
 (1207,"Fetch port_map_creations from Media Engine ICMP for both NAT44 and NAT64 for the last 2 days.","ims-worker",0.99992),
 (1208,"Pull up the last 2 days of Media Engine ICMP for both NAT44 and NAT64 data related to opened ports.","ims-worker",1),
 (1259,"I'd like to check call_clear_requests in Media Engine PPTP. Retrieve its readings for the last 2 days.","paco-worker",1),
 (1282,"Show the available tcp_null_flags_drops samples over the past 2 days from Media Engine Security.","mco-worker",0.99872),
 (1352,"Please look up PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR_BROKER_NOT_AVAILABLE for the last 2 days in the Provisioning Gateway northbound Kafka notifications measurements.","platform-worker",0.99962),
 (1353,"Could you look into failure response with error code 8 received from Kafka nodes for the network notification request using the last 2 days of Provisioning Gateway northbound Kafka notifications measurements?","platform-worker",1),
 (1372,"Please look up PROVGW_NB_HTTP_RCV_REQUEST for the last 2 days in the Provisioning Gateway northbound HTTP measurements.","paco-worker",0.9991),
 (1377,"Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 202 OK responses sent to requests.","mde-worker",1),
 (1513,"What values were recorded for RE_PERF_DIAMRE_AVG_LATENCY over the last 2 days in peer-VNF platform DIAMRE?","ims-worker",1),
 (1567,"Fetch MAP_MO_FSM_RCVD from peer-VNF platform MAP for the last 2 days.","paco-worker",0.82748),
 (1585,"Looking at peer-VNF platform SMTP, what does SMTP_HELO_EHLO_504_RCVD show for the past 2 days?","mco-worker",1),
 (1635,"Investigate why restored UEs come back without their PDU session context, pull the related counters and logs and tell us what stands out.","platform-worker",0.88592),
 (1645,"Did CCLB_HA_ACTIVE_IMPORT_SESSION_NOTIFY_TOTAL drop to zero during last night's maintenance window?","paco-worker",1),
 (1705,"What was the peak of MDPLB_SESSION_PACKETS_RX_UL_DELTA over the past 7 days and when did it happen?","paco-worker",1),
 (1795,"Radio paging load rose during the subscriber move, is it the migration?","ran-worker",0.9294),
 (2000,"Compare HTTP2_CLIENT_REQ_ERR_SESSION_TOTAL this week against the same weekday last week.","paco-worker",1),
]
df = pd.DataFrame(rows, columns=["Excel Row","Query","Picked Agent","Confidence"])
df.insert(1,"Domain","PACO"); df.insert(3,"Expected Agent","paco_worker")
df["Verdict"] = df["Picked Agent"].map(lambda x: "error" if pd.isna(x) else ("right" if x=="paco-worker" else "wrong"))
df["Error"] = df["Picked Agent"].map(lambda x: "('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))" if pd.isna(x) else "")
d = Path(__file__).parent / "fixture"; d.mkdir(exist_ok=True)
df.to_excel(d/"fixture_results.xlsx", sheet_name="Results", index=False)
pd.DataFrame({"Query":["Show DIAMRE Cx MAA 5006 count","Kafka broker down on CSCF"]}).to_excel(d/"ims_fixture.xlsx", index=False)
pd.DataFrame({"Name":["SeGW_DL_INCOMING_THROUGHPUT","PROVGW_NB_HTTP_RCV_REQUEST"]}).to_csv(d/"kpi_fixture.csv", index=False)
print("fixture written", len(df))
